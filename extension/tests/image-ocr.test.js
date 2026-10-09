import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageBlocks, captureVisiblePage, recognizeImage, validateImageFile } from '../image-ocr.js';

test('image files are limited to supported local screenshot formats and size', () => {
  const valid = { type: 'image/png', size: 1024 };
  assert.equal(validateImageFile(valid), valid);
  assert.throws(() => validateImageFile({ type: 'image/gif', size: 100 }), { code: 'INVALID_IMAGE' });
  assert.throws(() => validateImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 }), { code: 'IMAGE_TOO_LARGE' });
});

test('OCR text becomes bounded, source-labelled image metadata', () => {
  const result = buildImageBlocks('Important notice\n\nBring one valid ID.');
  assert.equal(result.kind, 'image');
  assert.deepEqual(result.blocks, [
    { id: 's1', text: 'Important notice' },
    { id: 's2', text: 'Bring one valid ID.' },
  ]);
  assert.equal(result.truncated, false);
  assert.throws(() => buildImageBlocks(' '), { code: 'OCR_NO_TEXT' });
  assert.ok(buildImageBlocks('x'.repeat(7000)).truncated);
});

test('visible-page capture uses only the active browser window', async () => {
  const calls = [];
  const api = { tabs: {
    query: async (query) => { calls.push(query); return [{ windowId: 4 }]; },
    captureVisibleTab: async (windowId, options) => { calls.push([windowId, options]); return 'data:image/png;base64,abc'; },
  } };
  assert.equal(await captureVisiblePage(api), 'data:image/png;base64,abc');
  assert.deepEqual(calls, [{ active: true, currentWindow: true }, [4, { format: 'png' }]]);
  await assert.rejects(captureVisiblePage({ tabs: {} }), { code: 'CAPTURE_UNAVAILABLE' });
});

test('OCR loads only packaged worker, core, and language assets and does not cache the image', async () => {
  let options;
  let terminated = 0;
  const tesseract = { createWorker: async (_language, _engine, supplied) => {
    options = supplied;
    return {
      recognize: async (image) => {
        assert.equal(image, 'data:image/png;base64,abc');
        return { data: { text: 'Words from screenshot', confidence: 91.5 } };
      },
      terminate: async () => { terminated += 1; },
    };
  } };
  const result = await recognizeImage('data:image/png;base64,abc', {
    tesseract,
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
  });
  assert.deepEqual(result, { text: 'Words from screenshot', confidence: 91.5 });
  assert.equal(options.cacheMethod, 'none');
  assert.equal(options.workerBlobURL, false);
  for (const path of [options.workerPath, options.corePath, options.langPath]) assert.match(path, /^chrome-extension:\/\/test\/vendor\/tesseract\//);
  assert.equal(terminated, 1);
});

test('OCR reports when Chrome is still using the manifest from before packaged WebAssembly was enabled', async () => {
  await assert.rejects(recognizeImage('data:image/png;base64,abc', {
    tesseract: { createWorker: async () => assert.fail('worker should not start') },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      getManifest: () => ({ version: '0.3.0' }),
    },
  }), { code: 'OCR_RELOAD_REQUIRED' });
});
