import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { applyGuidedView } from '../guided-view.js';

const browser = await chromium.launch({ channel: process.env.KAYA_BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<main><form id="registration"><label>Name <input id="name" value="PRIVATE_TYPED_NAME"></label>
    <label>Email <input id="email" type="email"></label><button>Submit</button></form></main>`);
  await page.evaluate(() => {
    const name = document.querySelector('#name');
    name.dataset.originalNode = 'yes';
    name.addEventListener('input', () => { document.body.dataset.originalListener = 'yes'; });
    Object.defineProperty(HTMLInputElement.prototype, 'value', { configurable: true, get() { throw new Error('Guided view must not read values'); } });
  });
  const plan = {
    overview: 'This form asks for contact details.',
    fieldMetadata: [
      { label: 'Name', type: 'text', required: true, placeholder: '', options: [] },
      { label: 'Email', type: 'email', required: false, placeholder: '', options: [] },
    ],
    fieldGuidance: [
      { fieldIndex: 1, plainLabel: 'Email address', helpText: 'Enter the requested email address.' },
      { fieldIndex: 0, plainLabel: 'Your name', helpText: 'Enter the requested name.' },
    ],
  };
  assert.deepEqual(await page.evaluate(applyGuidedView, plan), { appliedCount: 2 });
  assert.equal(await page.locator('#name').getAttribute('data-original-node'), 'yes');
  assert.equal(await page.locator('#registration #name').count(), 1, 'Original control must remain in its form');
  await page.locator('#name').dispatchEvent('input');
  assert.equal(await page.locator('body').getAttribute('data-original-listener'), 'yes', 'Original event listeners must remain attached');
  assert.equal(await page.locator('[data-kaya-mode-guided-active-v1]').getAttribute('id'), 'email');
  const host = page.locator('#__kaya_mode_guided_view_v1__');
  assert.equal(await host.count(), 1);
  assert.match(await host.evaluate((element) => element.shadowRoot.querySelector('.original').textContent), /Email.*not marked required/);
  await host.evaluate((element) => element.shadowRoot.querySelector('.exit').click());
  assert.equal(await page.locator('#__kaya_mode_guided_view_v1__').count(), 0);
  assert.equal(await page.locator('[data-kaya-mode-guided-active-v1]').count(), 0);
  assert.equal(await page.locator('#registration #name').count(), 1);
  console.log('Guided view checks passed: original controls stay in place, field order is applied, and cleanup is reversible.');
} finally { await browser.close(); }
