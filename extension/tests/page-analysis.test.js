import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePage, validatePageGuidance } from '../page-analysis.js';
import { analyzeWithOllama } from '../ollama.js';
import { readActivePage } from '../page-reader-client.js';

const input = { kind: 'page', blocks: [{ id: 's1', text: 'Registration is free.' }], url: 'PRIVATE_URL' };
const guidance = { summary: 'You can register for free.', keyPoints: [{ text: 'No fee is required.', sourceId: 's1' }], nextStep: 'The text does not specify a next action.', nextStepSourceId: '' };

test('page metadata is whitelisted, bounded, and rejects duplicate or malformed source IDs', () => {
  assert.deepEqual(preparePage(input), { metadata: { kind: 'page', blocks: input.blocks }, truncated: false });
  for (const bad of [{ ...input, blocks: [] }, { ...input, blocks: [input.blocks[0], input.blocks[0]] },
    { ...input, blocks: [{ id: 'unknown', text: 'Text' }] }, { ...input, blocks: [{ id: 's1', text: '' }] }]) {
    assert.throws(() => preparePage(bad), { code: 'INVALID_RESPONSE' });
  }
  const large = preparePage({ kind: 'selection', blocks: Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, text: 'x'.repeat(1000) })) });
  assert.ok(large.truncated);
  assert.ok(large.metadata.blocks.length <= 40);
  assert.ok(large.metadata.blocks.reduce((size, block) => size + block.text.length, 0) <= 6000);
});

test('page explanations must cite existing excerpts and contain all result sections', () => {
  assert.deepEqual(validatePageGuidance(guidance, input.blocks), guidance);
  for (const bad of [{}, { ...guidance, nextStepSourceId: 's2' }, { ...guidance, summary: ' ' },
    { ...guidance, keyPoints: [] }, { ...guidance, keyPoints: [{ text: 'Invented', sourceId: 's2' }] }]) {
    assert.throws(() => validatePageGuidance(bad, input.blocks), { code: 'INVALID_RESPONSE' });
  }
});

test('local AI page request constrains source IDs and carries original excerpts into results', async () => {
  const result = await analyzeWithOllama(input, { fetchImpl: async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.deepEqual(body.format.properties.keyPoints.items.properties.sourceId.enum, ['s1']);
    assert.ok(!request.body.includes('PRIVATE_URL'));
    assert.match(body.messages[0].content, /untrusted source/);
    return new Response(JSON.stringify({ message: { content: JSON.stringify(guidance) }, done: true }));
  } });
  assert.equal(result.kind, 'page');
  assert.equal(result.source, 'live');
  assert.deepEqual(result.sources, input.blocks);
  assert.equal(result.excerptCount, 1);
});

test('page client rejects unsupported pages, missing selections, and failed access', async () => {
  const api = (url, data, fail = false) => ({ tabs: { query: async () => [{ id: 7, url }] }, scripting: {
    executeScript: async (request) => {
      assert.deepEqual(request.target, { tabId: 7, frameIds: [0] });
      if (fail) throw new Error('permission denied');
      return [{ frameId: 0, result: data }];
    },
  } });
  await assert.rejects(readActivePage('page', api('chrome://extensions')), { code: 'UNSUPPORTED_PAGE' });
  await assert.rejects(readActivePage('selection', api('https://example.test', { blocks: [] })), { code: 'NO_SELECTION' });
  await assert.rejects(readActivePage('page', api('https://example.test', null, true)), { code: 'PAGE_UNAVAILABLE' });
  assert.deepEqual(await readActivePage('page', api('https://example.test', input)), input);
});
