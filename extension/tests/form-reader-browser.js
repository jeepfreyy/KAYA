// Run with Node; Playwright must be available separately (or via NODE_PATH).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { readFormMetadata } from '../form-reader.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ channel: process.env.KAYA_BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.setContent(await readFile(new URL('./fixtures/reader-form.html', import.meta.url), 'utf8'));
  const initial = await page.evaluate(readFormMetadata);
  assert.equal(initial.fields.length, 13);
  assert.deepEqual(initial.fields[0], {
    label: 'Full name', type: 'text', required: true, placeholder: 'Enter your full name', options: [],
  });
  assert.equal(initial.fields[1].label, 'Email address');
  assert.deepEqual(initial.fields[2], {
    label: 'Preferred session time', type: 'select', required: true, placeholder: '',
    options: ['Choose a session', 'Morning', 'Afternoon'],
  });
  assert.equal(initial.fields[3].label, 'Notes');
  assert.equal(initial.fields[4].label, 'I agree to be contacted');
  assert.equal(initial.fields[5].required, true);
  assert.equal(initial.fields[7].type, 'file');
  assert.equal(initial.fields[8].label, '');
  assert.equal(initial.fields[8].placeholder, '');
  assert.equal(initial.fields[9].label, 'Accessible fallback');
  assert.equal(initial.fields[10].label, 'Fallback label');
  assert.equal(initial.fields[11].label, 'Preferences');
  assert.equal(initial.fields[12].type, 'date');
  for (const field of initial.fields) {
    assert.deepEqual(Object.keys(field), ['label', 'type', 'required', 'placeholder', 'options']);
  }
  assert.ok(!JSON.stringify(initial).includes('PRIVATE_'));
  assert.ok(!JSON.stringify(initial).includes('97531'));
  await page.locator('#name').fill('PRIVATE_TYPED_NAME');
  await page.locator('input[type="email"]').fill('private@example.test');
  await page.locator('textarea').fill('PRIVATE_TYPED_NOTES');
  await page.locator('input[type="checkbox"]').uncheck();
  await page.locator('input[type="radio"]').last().check();
  await page.locator('select').selectOption('PRIVATE_OPTION_2');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'PRIVATE_UPLOAD.txt', mimeType: 'text/plain', buffer: Buffer.from('PRIVATE_UPLOAD_CONTENT'),
  });
  assert.deepEqual(await page.evaluate(readFormMetadata), initial, 'Editing values must never change metadata');
  // Fail immediately if extraction even attempts to read native value properties.
  await page.evaluate(() => {
    for (const [prototype, properties] of [
      [HTMLInputElement.prototype, ['value', 'checked', 'files']],
      [HTMLTextAreaElement.prototype, ['value']],
      [HTMLSelectElement.prototype, ['value', 'selectedIndex', 'selectedOptions']],
      [HTMLOptionElement.prototype, ['value', 'selected']],
    ]) {
      for (const property of properties) Object.defineProperty(prototype, property, {
        configurable: true, get() { throw new Error(`Forbidden value read: ${property}`); },
      });
    }
  });
  assert.deepEqual(await page.evaluate(readFormMetadata), initial);
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Dynamically added field');
    document.body.append(input);
  });
  assert.equal((await page.evaluate(readFormMetadata)).fields.at(-1).label, 'Dynamically added field');
  console.log('Fictional fixture metadata:', JSON.stringify(initial, null, 2));

  await page.setContent('<p>No form here</p><input type="password"><input type="hidden">');
  assert.deepEqual(await page.evaluate(readFormMetadata), { fields: [] });
  await page.setContent('<label for="two">Second label</label><label for="two">Extra label</label><input id="two">');
  assert.equal((await page.evaluate(readFormMetadata)).fields[0].label, 'Second label Extra label');
  await page.setContent('<input aria-label="  Lots   of   space  " placeholder="  Add   text  ">');
  assert.deepEqual((await page.evaluate(readFormMetadata)).fields[0], {
    label: 'Lots of space', type: 'text', required: false, placeholder: 'Add text', options: [],
  });
  await page.setContent(`<md-input-container><label>First Name</label><input></md-input-container>
    <mat-form-field><mat-label>Middle Name</mat-label><input></mat-form-field>
    <div class="form-group"><label>Last Name</label><input></div>`);
  assert.deepEqual((await page.evaluate(readFormMetadata)).fields.map((field) => field.label),
    ['First Name', 'Middle Name', 'Last Name']);
  await page.setContent('<div id="host"></div><iframe srcdoc="<input aria-label=Inside-frame>"></iframe>');
  await page.evaluate(() => document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Shadow field">');
  assert.deepEqual(await page.evaluate(readFormMetadata), { fields: [] });
  await page.setContent('<div id="limits"></div>');
  await page.evaluate(() => {
    const target = document.querySelector('#limits');
    for (let index = 0; index < 60; index++) {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'L'.repeat(1000));
      input.setAttribute('placeholder', 'P'.repeat(1000));
      target.append(input);
    }
    const select = document.createElement('select');
    for (let index = 0; index < 50; index++) select.append(new Option('O'.repeat(1000), 'PRIVATE_OPTION_VALUE'));
    target.prepend(select);
  });
  const bounded = await page.evaluate(readFormMetadata);
  assert.equal(bounded.fields.length, 50);
  assert.equal(bounded.fields[0].options.length, 30);
  assert.ok(bounded.fields[0].options.every((option) => option.length === 200));
  assert.ok(bounded.fields.slice(1).every((field) => field.label.length === 200 && field.placeholder.length === 200));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('Form reader browser checks passed: contract, native/accessible labels, hidden fields, value privacy, uploads, dynamic fields, empty pages, scope, and payload limits.');
} finally {
  await browser.close();
}
