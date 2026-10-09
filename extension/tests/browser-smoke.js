// Optional integration check: requires Playwright and a local Chrome installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/panel.html', 'text/html'], ['/styles.css', 'text/css'],
  ['/panel.js', 'text/javascript'], ['/analysis-service.js', 'text/javascript'],
  ['/page-reader.js', 'text/javascript'], ['/page-reader-client.js', 'text/javascript'], ['/page-analysis.js', 'text/javascript'],
  ['/form-reader-client.js', 'text/javascript'], ['/form-reader.js', 'text/javascript'],
  ['/guided-view-client.js', 'text/javascript'], ['/guided-view.js', 'text/javascript'],
  ['/local-ai-client.js', 'text/javascript'], ['/ollama.js', 'text/javascript'],
]);
const server = createServer(async (request, response) => {
  if (!files.has(request.url)) { response.writeHead(404).end(); return; }
  try {
    const data = await readFile(new URL(request.url.slice(1), root));
    response.writeHead(200, { 'Content-Type': files.get(request.url) }).end(data);
  } catch { response.writeHead(500).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.KAYA_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 480, height: 600 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) externalRequests.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/panel.html`);
  await page.locator('#scenario').selectOption('success');
  const analyze = page.getByRole('button', { name: 'Analyze', exact: true });
  assert.ok(await analyze.isEnabled());
  assert.ok(await page.getByText('Sample AI responses · demo only').isVisible());
  assert.ok(await page.locator('#results').isHidden());
  assert.ok(await analyze.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight));
  await page.locator('#scenario').focus();
  assert.equal(await page.locator(':focus').getAttribute('id'), 'scenario');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'analyze-button');
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('#analyze-button').isDisabled());
  assert.ok(await page.locator('#scenario').isDisabled());
  assert.equal(await page.locator('#assistant').getAttribute('aria-busy'), 'true');
  assert.ok(await page.locator('#spinner').isVisible());
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.equal(await page.locator(':focus').getAttribute('id'), 'results-title');
  for (const name of ['Overview', 'Preparation checklist', 'First step']) {
    assert.ok(await page.getByRole('heading', { name, exact: true }).isVisible());
  }
  assert.equal(await page.getByRole('checkbox').count(), 3);
  await page.getByRole('checkbox').first().check();
  assert.ok(await page.getByRole('checkbox').first().isChecked());
  const screenshot = process.argv.find((arg) => arg.startsWith('--screenshot='))?.slice(13);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  await analyze.click();
  assert.ok(await page.locator('#results').isHidden());
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.ok(!(await page.getByRole('checkbox').first().isChecked()));
  for (const [scenario, title] of [['no-form', 'Sample error: no form found'], ['unavailable', 'Sample error: AI unavailable']]) {
    await page.locator('#scenario').selectOption(scenario);
    assert.ok(await page.locator('#results').isHidden());
    await analyze.click();
    await page.getByRole('alert').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#error-title').textContent(), title);
    assert.ok(await analyze.isEnabled());
    assert.equal(await page.locator('#assistant').getAttribute('aria-busy'), 'false');
  }
  await page.locator('#scenario').selectOption('success');
  assert.ok(await page.getByRole('alert').isHidden());
  await analyze.click();
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const width of [320, 400, 640]) {
    await page.setViewportSize({ width, height: 600 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 480, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('#spinner').evaluate((element) => getComputedStyle(element).animationName), 'none');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log('Browser checks passed: keyboard flow, loading, results, checklist reset, both errors, recovery, responsive panel, reduced motion, and no external requests.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
