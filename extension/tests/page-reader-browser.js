import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readPageContent } from '../page-reader.js';
const browser = await chromium.launch({ channel: process.env.KAYA_BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<nav>PRIVATE_NAV</nav><main><h1>Community workshop</h1>
    <p id="paragraph">Registration is provisional until a confirmation email arrives.</p>
    <p>Phone numbers are optional.</p><div hidden>PRIVATE_HIDDEN</div>
    <div style="display:none">PRIVATE_CSS</div><div aria-hidden="true">PRIVATE_ARIA</div>
    <input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea>
    <select><option>PRIVATE_OPTION</option></select><div contenteditable="true">PRIVATE_EDITABLE</div>
    <input type="password" value="PRIVATE_PASSWORD"><button>PRIVATE_BUTTON</button>
    <iframe srcdoc="<p>PRIVATE_IFRAME</p>"></iframe></main><footer>PRIVATE_FOOTER</footer>`);
  await page.evaluate(() => {
    for (const prototype of [HTMLInputElement.prototype, HTMLTextAreaElement.prototype, HTMLSelectElement.prototype]) {
      Object.defineProperty(prototype, 'value', { get() { throw new Error('Values must never be read'); } });
    }
  });
  const result = await page.evaluate(readPageContent, 'page');
  assert.equal(result.kind, 'page');
  assert.ok(JSON.stringify(result).includes('provisional'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  const select = async (selector, start, end) => page.evaluate(({ selector, start, end }) => {
    const element = document.querySelector(selector);
    const range = document.createRange();
    if (start === undefined) range.selectNodeContents(element);
    else { range.setStart(element.firstChild, start); range.setEnd(element.firstChild, end); }
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, { selector, start, end });
  await select('#paragraph', 16, 27);
  assert.deepEqual((await page.evaluate(readPageContent, 'selection')).blocks, [{ id: 's1', text: 'provisional' }]);
  await select('main');
  assert.ok(!JSON.stringify(await page.evaluate(readPageContent, 'selection')).includes('PRIVATE_'));
  await select('[contenteditable]');
  assert.deepEqual((await page.evaluate(readPageContent, 'selection')).blocks, []);
  await page.evaluate(() => getSelection().removeAllRanges());
  assert.deepEqual((await page.evaluate(readPageContent, 'selection')).blocks, []);
  await page.setContent('<main>' + Array.from({ length: 70 }, () => `<p>${'Long page text '.repeat(80)}</p>`).join('') + '</main>');
  const long = await page.evaluate(readPageContent, 'page');
  assert.ok(long.truncated);
  assert.ok(long.blocks.length <= 40);
  assert.ok(long.blocks.every((block) => block.text.length <= 700));
  assert.ok(long.blocks.reduce((sum, block) => sum + block.text.length, 0) <= 6000);
  console.log('Page reader checks passed: page/selection boundaries, hidden and editable content exclusion, no value reads, bounded payloads.');
} finally { await browser.close(); }
