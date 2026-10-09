import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithOllama, checkOllama, prepareMetadata, validateGuidance, validateGuidedView, MODEL } from '../ollama.js';
const metadata = { fields: [{ label: 'Name', type: 'text', placeholder: '', required: true, options: [], value: 'PRIVATE_VALUE' }] };
const guidance = { overview: 'A registration form.', preparationChecklist: ['Your name'], firstStep: 'Enter your name.' };
function streamed(content = JSON.stringify(guidance), final = {}) {
  const lines = [...content].map((character) => JSON.stringify({ message: { content: character }, done: false }));
  lines.push(JSON.stringify({ done: true, model: MODEL, total_duration: 1230000000, ...final }));
  const bytes = new TextEncoder().encode(lines.join('\n')); // no final newline intentionally
  return new Response(new ReadableStream({ start(controller) {
    for (let index = 0; index < bytes.length; index += 17) controller.enqueue(bytes.slice(index, index + 17));
    controller.close();
  } }));
}

test('structured streaming request is local, bounded, and excludes caller values', async () => {
  const result = await analyzeWithOllama(metadata, { fetchImpl: async (url, request) => {
    assert.equal(url, 'http://localhost:11434/api/chat');
    assert.equal(request.redirect, 'error');
    const body = JSON.parse(request.body);
    assert.equal(body.model, MODEL);
    assert.equal(body.stream, true);
    assert.ok(body.format.required.includes('firstStep'));
    assert.ok(!request.body.includes('PRIVATE_VALUE'));
    assert.match(body.messages[0].content, /untrusted/);
    return streamed();
  } });
  assert.equal(result.source, 'live');
  assert.equal(result.model, MODEL);
  assert.equal(result.inferenceDurationMs, 1230);
  assert.equal(result.fieldCount, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.overview, guidance.overview);
});

test('split UTF-8 stream preserves Unicode and safely treats text as data', async () => {
  const result = await analyzeWithOllama(metadata, { fetchImpl: async () => streamed(JSON.stringify({
    ...guidance, overview: 'Kaya mo ’to 🌱 <script>alert(1)</script>',
  })) });
  assert.equal(result.overview, 'Kaya mo ’to 🌱 <script>alert(1)</script>');
});

test('guided form requests produce a complete, source-indexed view plan', async () => {
  const guided = { ...guidance, fieldGuidance: [{ fieldIndex: 0, plainLabel: 'Your name', helpText: 'Enter the name requested by this form.' }] };
  const result = await analyzeWithOllama({ kind: 'guided', ...metadata }, { fetchImpl: async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.ok(body.format.required.includes('fieldGuidance'));
    assert.deepEqual(body.format.properties.fieldGuidance.items.properties.fieldIndex.enum, [0]);
    assert.match(body.messages[0].content, /original input/);
    assert.ok(!request.body.includes('PRIVATE_VALUE'));
    return streamed(JSON.stringify(guided));
  } });
  assert.equal(result.kind, 'guided');
  assert.deepEqual(result.fieldGuidance, guided.fieldGuidance);
  assert.throws(() => validateGuidedView({ ...guided, fieldGuidance: [] }, metadata.fields), { code: 'INVALID_RESPONSE' });
  assert.equal(validateGuidedView({ ...guided, fieldGuidance: [guided.fieldGuidance[0], guided.fieldGuidance[0]] }, metadata.fields).fieldGuidance.length, 1);
  const twoFields = [...metadata.fields, { label: 'Email', type: 'email', placeholder: '', required: false, options: [] }];
  const completed = validateGuidedView(guided, twoFields).fieldGuidance;
  assert.deepEqual(completed[1], { fieldIndex: 1, plainLabel: 'Email', helpText: 'This field is optional or is not marked required.' });
});

test('invalid, incomplete, oversized, or token-limited model output is rejected', async () => {
  for (const response of [streamed('not JSON'), streamed('{}'), streamed(JSON.stringify(guidance), { done_reason: 'length' }),
    new Response('{"message":{"content":"partial"}}\n'), new Response('broken\n'),
    streamed(JSON.stringify({ ...guidance, overview: 'X'.repeat(2001) }))]) {
    await assert.rejects(analyzeWithOllama(metadata, { fetchImpl: async () => response }), { code: 'INVALID_RESPONSE' });
  }
});

test('HTTP errors and connection failures map to actionable codes', async () => {
  for (const [status, code] of [[404, 'MODEL_MISSING'], [403, 'ORIGIN_BLOCKED'], [503, 'AI_BUSY'], [500, 'AI_FAILED']]) {
    await assert.rejects(analyzeWithOllama(metadata, { fetchImpl: async () => new Response('', { status }) }), { code });
  }
  await assert.rejects(analyzeWithOllama(metadata, { fetchImpl: async () => { throw new TypeError('Private connection details'); } }), { code: 'AI_UNAVAILABLE' });
});

test('timeout and user cancellation abort in-flight requests', async () => {
  const hang = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(analyzeWithOllama(metadata, { fetchImpl: hang, timeoutMs: 10 }), { code: 'TIMEOUT' });
  const controller = new AbortController();
  const pending = analyzeWithOllama(metadata, { fetchImpl: hang, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
});

test('metadata is whitelisted and limited before prompting', () => {
  const large = { fields: Array.from({ length: 70 }, () => ({ ...metadata.fields[0], label: 'L'.repeat(600), options: Array(50).fill('O'.repeat(400)) })) };
  const prepared = prepareMetadata(large);
  assert.ok(JSON.stringify(prepared.metadata).length <= 8000);
  assert.ok(prepared.metadata.fields.length <= 50);
  assert.ok(prepared.truncated);
  assert.ok(!JSON.stringify(prepared).includes('PRIVATE_VALUE'));
  assert.throws(() => prepareMetadata({ fields: [] }), { code: 'NO_FORM' });
  assert.throws(() => prepareMetadata({ fields: [{}] }), { code: 'INVALID_METADATA' });
  assert.throws(() => validateGuidance({ ...guidance, preparationChecklist: [' '] }), { code: 'INVALID_RESPONSE' });
});

test('connection check verifies the exact downloaded local model', async () => {
  assert.deepEqual(await checkOllama({ fetchImpl: async () => Response.json({ models: [{ name: MODEL }] }) }), { model: MODEL, ready: true });
  await assert.rejects(checkOllama({ fetchImpl: async () => Response.json({ models: [] }) }), { code: 'MODEL_MISSING' });
  await assert.rejects(checkOllama({ fetchImpl: async () => new Response('', { status: 403 }) }), { code: 'ORIGIN_BLOCKED' });
});
