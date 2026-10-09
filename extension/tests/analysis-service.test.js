import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { analyzeForm, AnalysisError, getErrorMessage, validateAnalysis } from '../analysis-service.js';

test('sample analysis is delayed, labeled, complete, and independent on each call', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const pending = analyzeForm({ scenario: 'success' }).then((result) => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(900);
  const result = await pending;
  assert.equal(result.source, 'sample');
  assert.ok(result.overview.includes('fictional'));
  assert.equal(result.preparationChecklist.length, 3);
  assert.ok(result.firstStep.includes('Full name'));
  result.preparationChecklist.pop();
  const next = analyzeForm({ scenario: 'success' });
  t.mock.timers.tick(900);
  assert.equal((await next).preparationChecklist.length, 3);
});

for (const [scenario, code] of [['no-form', 'SAMPLE_NO_FORM'], ['unavailable', 'SAMPLE_AI_UNAVAILABLE'], ['unknown', 'INVALID_SCENARIO']]) {
  test(`${scenario} fails with a structured error and allows a later retry`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = analyzeForm({ scenario });
    const check = assert.rejects(pending, (error) => error instanceof AnalysisError && error.code === code);
    t.mock.timers.tick(900);
    await check;
    const retry = analyzeForm({ scenario: 'success' });
    t.mock.timers.tick(900);
    assert.equal((await retry).source, 'sample');
  });
}

test('incomplete or malformed results are rejected before rendering', () => {
  const valid = { source: 'sample', overview: 'Overview', preparationChecklist: ['Prepare'], firstStep: 'Begin' };
  for (const result of [null, {}, { ...valid, source: 'unknown' }, { ...valid, overview: ' ' },
    { ...valid, firstStep: 12 }, { ...valid, preparationChecklist: [] },
    { ...valid, preparationChecklist: [''] }, { ...valid, preparationChecklist: 'Prepare' }]) {
    assert.throws(() => validateAnalysis(result), { code: 'INVALID_RESPONSE' });
  }
  assert.equal(validateAnalysis(valid), valid);
  assert.equal(validateAnalysis({ ...valid, source: 'live' }).source, 'live');
  const guided = { ...valid, source: 'live', kind: 'guided', fieldCount: 1,
    fieldGuidance: [{ fieldIndex: 0, plainLabel: 'Your name', helpText: 'Enter the requested name.' }] };
  assert.equal(validateAnalysis(guided), guided);
  assert.throws(() => validateAnalysis({ ...guided, fieldGuidance: [] }), { code: 'INVALID_RESPONSE' });
});

test('errors provide recovery guidance without exposing raw exceptions', () => {
  for (const code of ['NO_FORM', 'AI_UNAVAILABLE', 'INVALID_RESPONSE']) {
    const message = getErrorMessage(new AnalysisError(code, 'private internal detail'));
    assert.ok(message.title);
    assert.match(message.message, /Analyze/);
    assert.ok(!message.message.includes('private internal detail'));
  }
  assert.deepEqual(getErrorMessage(new Error('private internal detail')), getErrorMessage(null));
});

test('manifest loads a local side panel with scoped permissions and no remote code', async () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Kaya Mode');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'sidePanel']);
  assert.deepEqual(manifest.host_permissions, ['http://localhost:11434/*']);
  assert.equal(manifest.background.type, 'module');
  await access(new URL(manifest.background.service_worker, root));
  assert.equal(manifest.action.default_popup, undefined);
  const popup = await readFile(new URL(manifest.side_panel.default_path, root), 'utf8');
  const resources = [...popup.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(resources.length >= 2);
  for (const resource of resources) {
    if (resource === 'http://localhost:4173') continue; // User-opened local practice page.
    assert.ok(!resource.includes('://'));
    await access(new URL(resource, root));
  }
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(popup));
});
