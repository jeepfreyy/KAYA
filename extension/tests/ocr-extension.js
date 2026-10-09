// Packaged OCR runtime check inside a real unpacked Chrome extension.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const project = new URL('../../', import.meta.url);
const runtime = new URL('.kaya-runtime/', project);
await mkdir(runtime, { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('ocr-test-', runtime)));
const extension = fileURLToPath(new URL('../', import.meta.url));
let context;
try {
  context = await chromium.launchPersistentContext(`${directory}/profile`, {
    channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: extension });
  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(serviceWorker.url()).host;
  const panel = await context.newPage();
  const logs = [];
  panel.on('console', (message) => logs.push(`${message.type()}: ${message.text()}`));
  panel.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  const result = await panel.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 180;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = 'white'; drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = 'black'; drawing.font = 'bold 58px sans-serif'; drawing.fillText('Bring one valid ID', 35, 110);
    const { recognizeImage } = await import(chrome.runtime.getURL('image-ocr.js'));
    return Promise.race([
      recognizeImage(canvas.toDataURL('image/png'), {
        onProgress: (progress) => console.log('OCR_PROGRESS', JSON.stringify(progress)),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OCR runtime timed out')), 45000)),
    ]);
  }).catch((error) => {
    throw new Error(`${error.message}\n${logs.join('\n')}`);
  });
  assert.match(result.text, /Bring one valid ID/i);
  assert.ok(result.confidence > 50);
  console.log(`Packaged OCR passed: ${JSON.stringify(result)}\n${logs.join('\n')}`);
} finally {
  await context?.close();
}
