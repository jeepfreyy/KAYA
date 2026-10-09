// Real unpacked extension + real toolbar action + real Ollama check.
// Requires recent Chrome with the CDP Extensions testing API and local Qwen.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createDemoServer } from '../../scripts/serve-kaya-demo.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const project = new URL('../../', import.meta.url);
const runtime = new URL('.kaya-runtime/', project);
await mkdir(runtime, { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('extension-test-', runtime)));
const extension = fileURLToPath(new URL('../', import.meta.url));
const server = createDemoServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(`${directory}/profile`, {
    channel: 'chrome', headless: true, viewport: { width: 900, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: extension });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  assert.equal(extensionId, 'ojmclkkncanmfmkkbilgmcmcfbnfaoid');
  const errors = [];
  const requests = [];
  context.on('request', (request) => requests.push(request.url()));
  const demo = await context.newPage();
  await demo.goto(`http://127.0.0.1:${server.address().port}/`);
  await demo.locator('#full-name').fill('PRIVATE_NAME_SENTINEL');
  await demo.locator('#email').fill('private-sentinel@example.test');
  await demo.locator('#notes').fill('PRIVATE_NOTES_SENTINEL');
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
  const targetInfo = targetInfos.find((target) => target.url === demo.url());
  assert.ok(targetInfo, 'Demo tab target must exist');
  await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: targetInfo.targetId });
  // Headless Chrome does not expose its native side panel as a Playwright page.
  // The real action grants activeTab; exercise the same panel document in a tab.
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 480, height: 600 });
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  panel.on('pageerror', (error) => errors.push(error.message));
  await panel.waitForLoadState();
  await worker.evaluate(() => {
    const original = globalThis.fetch;
    globalThis.fetch = (url, options) => {
      if (String(url).endsWith('/api/chat')) globalThis.__kayaTestBody = options.body;
      return original(url, options);
    };
  });
  const focusDemo = async () => worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.url === url);
    if (!tab) throw new Error(`Fixture tab missing: ${JSON.stringify(tabs)}`);
    await chrome.tabs.update(tab.id, { active: true });
  }, demo.url());
  await focusDemo();
  await panel.evaluate(() => document.querySelector('#check-ai').click());
  await panel.waitForFunction(() => document.querySelector('#assistant').getAttribute('aria-busy') === 'false', null, { timeout: 10000 });
  assert.match(await panel.locator('#status').textContent(), /Kaya is ready/);
  // Exercise all four modes against the actual local model, not samples.
  for (const mode of ['page', 'selection']) {
    if (mode === 'selection') await demo.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#selection-example'));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    if (await panel.locator('#results').isVisible()) await panel.locator('#new-task-button').click();
    await panel.locator(mode === 'page' ? '#task-page' : '#task-selection').click();
    await panel.waitForFunction(() => !document.querySelector('#results').hidden || !document.querySelector('#error-card').hidden, null, { timeout: 125000 });
    if (await panel.locator('#error-card').isVisible()) throw new Error(`${mode}: ${await panel.locator('#error-card').innerText()}`);
    assert.equal(await panel.locator('#result-source').textContent(), "Kaya's guide");
    assert.ok(await panel.locator('.source-excerpt').count() > 0);
    assert.ok(await panel.locator('#overview').textContent());
    const body = await worker.evaluate(() => globalThis.__kayaTestBody);
    assert.ok(!body.includes('PRIVATE_') && !body.includes('private-sentinel'));
    assert.equal(JSON.parse(JSON.parse(body).messages[1].content).kind, mode);
    if (mode === 'selection') {
      assert.ok(!body.includes('Phone number'));
      assert.doesNotMatch(await panel.locator('#first-step').textContent(), /contact|call|send|submit/i,
        'A passage about receiving confirmation must not invent an action for the reader');
    }
    const result = await panel.locator('#results').innerText();
    await mkdir(new URL('test-results/', project), { recursive: true });
    await panel.screenshot({ path: fileURLToPath(new URL(`test-results/kaya-${mode}.png`, project)), fullPage: true });
    await writeFile(new URL(`test-results/${mode}-result.txt`, project), result);
    console.log(`REAL ${mode.toUpperCase()} RESULT:\n${result}`);
  }
  // OCR an uploaded crop with the packaged Tesseract worker, then explain its text using local Qwen.
  const imageBuffer = await demo.locator('#selection-example').screenshot();
  await panel.locator('#new-task-button').click();
  await panel.locator('#task-image').click();
  await panel.locator('#image-upload').setInputFiles({ name: 'selected-words.png', mimeType: 'image/png', buffer: imageBuffer });
  await panel.locator('#image-preview').waitFor({ state: 'visible' });
  await panel.locator('#read-image').click();
  await panel.waitForFunction(() => !document.querySelector('#results').hidden || !document.querySelector('#error-card').hidden, null, { timeout: 125000 });
  if (await panel.locator('#error-card').isVisible()) throw new Error(`image: ${await panel.locator('#error-card').innerText()}`);
  assert.match(await panel.locator('#result-meta').textContent(), /OCR \d+%/);
  assert.match(await panel.locator('#results-footnote').textContent(), /recognized words/);
  const imageBody = await worker.evaluate(() => globalThis.__kayaTestBody);
  assert.equal(JSON.parse(JSON.parse(imageBody).messages[1].content).kind, 'image');
  assert.ok(!imageBody.includes('PRIVATE_') && !imageBody.includes('private-sentinel'));
  await panel.screenshot({ path: fileURLToPath(new URL('test-results/kaya-image.png', project)), fullPage: true });
  await panel.locator('#new-task-button').click();
  await panel.locator('#task-image').click();
  await focusDemo();
  await panel.evaluate(() => document.querySelector('#capture-image').click());
  await panel.locator('#image-preview').waitFor({ state: 'visible' });
  assert.ok(await panel.locator('#image-canvas').evaluate((canvas) => canvas.width > 0 && canvas.height > 0));
  await panel.locator('#close-image').click();
  await panel.locator('#task-form').click();
  await panel.waitForFunction(() => !document.querySelector('#results').hidden || !document.querySelector('#error-card').hidden, null, { timeout: 125000 });
  if (await panel.locator('#error-card').isVisible()) throw new Error(await panel.locator('#error-card').innerText());
  assert.equal(await panel.locator('#result-source').textContent(), "Kaya's guide");
  assert.match(await panel.locator('#result-meta').textContent(), /qwen2\.5:3b/);
  assert.ok(await panel.locator('#overview').textContent());
  assert.ok(await panel.locator('#first-step').textContent());
  assert.ok(await panel.getByRole('checkbox').count() > 0);
  const body = await worker.evaluate(() => globalThis.__kayaTestBody);
  assert.ok(!body.includes('PRIVATE_') && !body.includes('private-sentinel'));
  const result = await panel.locator('#results').innerText();
  assert.ok(!result.includes('PRIVATE_'));
  await mkdir(new URL('test-results/', project), { recursive: true });
  await panel.screenshot({ path: fileURLToPath(new URL('test-results/kaya-live.png', project)), fullPage: true });
  await writeFile(new URL('test-results/live-result.txt', project), result);
  console.log('REAL LOCAL QWEN RESULT:\n' + result);
  await focusDemo();
  await panel.locator('#guide-form-button').click();
  await panel.waitForFunction(() => !document.querySelector('#results').hidden || !document.querySelector('#error-card').hidden, null, { timeout: 125000 });
  if (await panel.locator('#error-card').isVisible()) throw new Error(`guided: ${await panel.locator('#error-card').innerText()}`);
  assert.equal(await panel.locator('#result-source').textContent(), "Kaya's guide");
  assert.equal(await demo.locator('#__kaya_mode_guided_view_v1__').count(), 1);
  assert.equal(await demo.locator('form #full-name').count(), 1, 'Guided mode must retain the original form field');
  assert.equal(await demo.locator('[data-kaya-mode-guided-active-v1]').count(), 1);
  const guidedBody = await worker.evaluate(() => globalThis.__kayaTestBody);
  assert.equal(JSON.parse(JSON.parse(guidedBody).messages[1].content).fields.length, 8);
  assert.ok(!guidedBody.includes('PRIVATE_') && !guidedBody.includes('private-sentinel'));
  await demo.screenshot({ path: fileURLToPath(new URL('test-results/kaya-guided-page.png', project)), fullPage: true });
  await demo.locator('#__kaya_mode_guided_view_v1__').evaluate((element) => element.shadowRoot.querySelector('.exit').click());
  assert.equal(await demo.locator('#__kaya_mode_guided_view_v1__').count(), 0);
  // Confirm cancellation remains available and stops a second real request.
  await focusDemo();
  await panel.locator('#new-task-button').click();
  await panel.locator('#task-form').click();
  await panel.locator('#cancel-button').waitFor({ state: 'visible' });
  await panel.evaluate(() => document.querySelector('#cancel-button').click());
  await panel.waitForFunction(() => document.querySelector('#assistant').getAttribute('aria-busy') === 'false');
  assert.match(await panel.locator('#status').textContent(), /Cancelled/);
  // Change the DOM without navigating away.
  await demo.evaluate(() => { document.querySelector('form').remove(); });
  await panel.locator('#task-form').click();
  await panel.waitForFunction(() => !document.querySelector('#error-card').hidden);
  assert.equal(await panel.locator('#error-title').textContent(), 'No supported form found');
  await panel.locator('#task-page').click();
  await panel.locator('#results').waitFor({ state: 'visible' });
  await demo.goto(`http://127.0.0.1:${server.address().port}/no-form.html`);
  await panel.waitForFunction(() => document.querySelector('#results').hidden);
  assert.match(await panel.locator('#status').textContent(), /page changed/);
  assert.deepEqual(errors, []);
  const external = requests.filter((url) => !url.startsWith('http://localhost:11434/')
    && !url.startsWith('http://127.0.0.1:') && !url.startsWith(`chrome-extension://${extensionId}/`));
  assert.deepEqual(external, []);
  console.log('PASS: unpacked extension, packaged OCR, screenshot upload/capture, real page/selection/image/form/guided inference, retained original controls, privacy, cancellation, navigation reset, no-form error, and localhost-only traffic.');
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
}
