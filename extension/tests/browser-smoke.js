// Optional integration check: requires Playwright and a local Chrome installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/panel.html', 'text/html'], ['/styles.css', 'text/css'],
  ['/assets/kaya-logo.png', 'image/png'],
  ['/theme.js', 'text/javascript'],
  ['/panel.js', 'text/javascript'], ['/analysis-service.js', 'text/javascript'],
  ['/page-reader.js', 'text/javascript'], ['/page-reader-client.js', 'text/javascript'], ['/page-analysis.js', 'text/javascript'],
  ['/form-reader-client.js', 'text/javascript'], ['/form-reader.js', 'text/javascript'],
  ['/guided-view-client.js', 'text/javascript'], ['/guided-view.js', 'text/javascript'],
  ['/local-ai-client.js', 'text/javascript'], ['/ollama.js', 'text/javascript'], ['/image-ocr.js', 'text/javascript'],
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
  const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
  await page.addInitScript(() => {
    const listeners = () => {
      const callbacks = [];
      return { callbacks, api: { addListener: (callback) => callbacks.push(callback) } };
    };
    globalThis.chrome = {
      tabs: {
        query: async () => [{ id: 1, windowId: 1, url: 'https://example.test/form' }],
        captureVisibleTab: async () => 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="200"%3E%3Crect width="100%25" height="100%25" fill="white"/%3E%3Ctext x="30" y="100" font-size="32"%3EBring one valid ID%3C/text%3E%3C/svg%3E',
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
      },
      scripting: {
        executeScript: async ({ func, args }) => {
          if (func.name === 'readPageContent') return [{ frameId: 0, result: {
            kind: args[0], blocks: [{ id: 's1', text: 'Registration is free and closes on Friday.' }], truncated: false,
          } }];
          if (func.name === 'readFormMetadata') return [{ frameId: 0, result: {
            kind: 'form', fields: [{ tag: 'input', type: 'text', label: 'Full name', name: 'name', required: true, placeholder: '', options: [] }], truncated: false,
          } }];
          return [{ frameId: 0, result: { appliedCount: 1 } }];
        },
      },
      runtime: {
        lastError: undefined,
        getURL: (path) => `chrome-extension://test/${path}`,
        connect: () => {
          const messages = listeners();
          const disconnects = listeners();
          return {
            onMessage: messages.api,
            onDisconnect: disconnects.api,
            disconnect() {},
            postMessage(message) {
              if (message.type === 'ping') return;
              setTimeout(() => {
                if (message.type === 'check') {
                  messages.callbacks.forEach((callback) => callback({ type: 'result', result: { ready: true, model: 'qwen2.5:3b' } }));
                  return;
                }
                const input = message.metadata;
                const result = ['page', 'selection', 'image'].includes(input.kind) ? {
                  source: 'live', kind: input.kind, model: 'qwen2.5:3b', durationMs: 1200,
                  summary: 'This page explains a free registration.',
                  keyPoints: [{ text: 'Registration is free.', sourceId: 's1' }],
                  nextStep: 'Check the Friday deadline.', nextStepSourceId: 's1',
                  sources: input.blocks, excerptCount: input.blocks.length, truncated: false,
                } : {
                  source: 'live', kind: input.kind === 'guided' ? 'guided' : 'form', model: 'qwen2.5:3b', durationMs: 1200,
                  overview: 'This form registers you for an event.', preparationChecklist: ['The name you want to use'],
                  firstStep: 'Start with the Full name field.', fieldCount: input.fields.length, truncated: false,
                  ...(input.kind === 'guided' ? { fieldGuidance: [{ fieldIndex: 0, plainLabel: 'Your name', helpText: 'Enter the requested name.' }] } : {}),
                };
                messages.callbacks.forEach((callback) => callback({ type: 'result', result }));
              }, 120);
            },
          };
        },
      },
    };
    globalThis.Tesseract = { createWorker: async () => ({
      recognize: async () => ({ data: { text: 'Bring one valid ID.', confidence: 94 } }),
      terminate: async () => {},
    }) };
  });

  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) externalRequests.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/panel.html`);

  assert.ok(await page.getByRole('heading', { name: 'What do you need help with?' }).isVisible());
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  assert.ok(['light', 'dark'].includes(initialTheme));
  await page.locator('#theme-toggle').click();
  const selectedTheme = initialTheme === 'dark' ? 'light' : 'dark';
  assert.equal(await page.locator('html').getAttribute('data-theme'), selectedTheme);
  assert.equal(await page.evaluate(() => localStorage.getItem('kaya-theme')), selectedTheme);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), selectedTheme);
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), String(selectedTheme === 'dark'));
  assert.equal(await page.locator('.task-button').count(), 4);
  assert.ok(await page.getByText('You are in control.').isVisible());
  assert.ok(await page.locator('#results').isHidden());
  await page.locator('#task-page').focus();
  assert.equal(await page.locator(':focus').getAttribute('id'), 'task-page');
  await page.evaluate(() => {
    const assistant = document.querySelector('#assistant');
    new MutationObserver(() => {
      if (assistant.getAttribute('aria-busy') === 'true') assistant.dataset.sawBusy = 'true';
    }).observe(assistant, { attributes: true, attributeFilter: ['aria-busy'] });
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#assistant').dataset.sawBusy === 'true');
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.equal(await page.locator(':focus').getAttribute('id'), 'results-title');
  for (const name of ['Start here', 'What this means', 'Important points']) {
    assert.ok(await page.getByText(name, { exact: true }).isVisible());
  }
  assert.ok(await page.locator('.source-excerpt').count() > 0);
  assert.ok(await page.locator('#task-picker').isHidden());
  for (const selector of ['#main-intro', '#privacy-note', '#status', '#help-panel']) {
    assert.ok(await page.locator(selector).isHidden(), `${selector} is hidden in the focused results view`);
  }

  await page.locator('#new-task-button').click();
  assert.ok(await page.locator('#task-picker').isVisible());
  for (const selector of ['#main-intro', '#privacy-note', '#status', '#help-panel']) {
    assert.ok(await page.locator(selector).isVisible(), `${selector} is restored on the main screen`);
  }
  assert.equal(await page.locator(':focus').getAttribute('id'), 'task-title');
  await page.locator('#task-form').click();
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('checkbox').count(), 1);
  assert.ok(await page.locator('#guide-form-button').isVisible());
  await page.getByRole('checkbox').check();
  await page.locator('#guide-form-button').click();
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#mode-badge').textContent(), 'On the page');
  assert.equal(await page.locator('#mode-badge').evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
  assert.match(await page.locator('#status').textContent(), /now beside the original form fields/);

  await page.locator('#new-task-button').click();
  await page.locator('#task-image').click();
  assert.ok(await page.locator('#image-workflow').isVisible());
  await page.locator('#capture-image').click();
  await page.locator('#image-preview').waitFor({ state: 'visible' });
  await page.locator('#read-image').click();
  await page.locator('#results').waitFor({ state: 'visible' });
  assert.match(await page.locator('#result-meta').textContent(), /OCR 94%/);
  assert.match(await page.locator('#results-footnote').textContent(), /recognized words/);

  await page.locator('#new-task-button').click();
  await page.locator('#help-panel summary').click();
  await page.locator('#check-ai').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Kaya is ready'));

  const screenshot = process.argv.find((arg) => arg.startsWith('--screenshot='))?.slice(13);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const width of [320, 400, 640]) {
    await page.setViewportSize({ width, height: 640 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log('Browser checks passed: simple one-click choices, loading, results, guided follow-up, help check, keyboard focus, and responsive layout.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
