import test from 'node:test';
import assert from 'node:assert/strict';
import { readActiveFormMetadata, FormReaderError } from '../form-reader-client.js';
import { readFormMetadata } from '../form-reader.js';

const metadata = { fields: [{ label: 'Full name', type: 'text', required: true, placeholder: '', options: [] }] };
function api({ url = 'https://example.test/form', result = metadata, tabId = 7 } = {}) {
  return {
    tabs: { query: async (query) => {
      assert.deepEqual(query, { active: true, currentWindow: true });
      return [{ id: tabId, url }];
    } },
    scripting: { executeScript: async (request) => {
      assert.deepEqual(request.target, { tabId: 7, frameIds: [0] });
      assert.equal(request.world, 'ISOLATED');
      assert.equal(request.func, readFormMetadata);
      return [{ frameId: 0, result }];
    } },
  };
}
const hasCode = (code) => (error) => error instanceof FormReaderError && error.code === code;

test('reader client injects only into the active main frame and returns the shared metadata', async () => {
  assert.deepEqual(await readActiveFormMetadata(api()), metadata);
});

test('reader client converts an empty result to a useful NO_FORM error', async () => {
  await assert.rejects(readActiveFormMetadata(api({ result: { fields: [] } })), hasCode('NO_FORM'));
});

test('reader client rejects restricted/non-web pages before injection', async () => {
  for (const url of ['chrome://settings', 'edge://extensions', 'file:///C:/form.html',
    'chrome-extension://id/panel.html', 'https://chromewebstore.google.com/detail/extension',
    'https://chrome.google.com/webstore/detail/extension',
    'https://microsoftedge.microsoft.com/addons/detail/extension']) {
    const chromeApi = api({ url });
    chromeApi.scripting.executeScript = () => assert.fail('Must not inject into restricted pages');
    await assert.rejects(readActiveFormMetadata(chromeApi), hasCode('UNSUPPORTED_PAGE'));
  }
});

test('reader client handles missing APIs, closed tabs, query failure, and injection denial', async () => {
  await assert.rejects(readActiveFormMetadata({}), hasCode('READER_UNAVAILABLE'));
  await assert.rejects(readActiveFormMetadata(api({ tabId: null })), hasCode('PAGE_UNAVAILABLE'));
  await assert.rejects(readActiveFormMetadata(api({ url: 'not a URL' })), hasCode('PAGE_UNAVAILABLE'));
  const noTab = api();
  noTab.tabs.query = async () => [];
  await assert.rejects(readActiveFormMetadata(noTab), hasCode('PAGE_UNAVAILABLE'));
  const denied = api();
  denied.scripting.executeScript = async () => { throw new Error('PRIVATE_INTERNAL_ERROR'); };
  await assert.rejects(readActiveFormMetadata(denied), (error) => hasCode('PAGE_UNAVAILABLE')(error)
    && !error.message.includes('PRIVATE_INTERNAL_ERROR'));
  const queryFailure = api();
  queryFailure.tabs.query = async () => { throw new Error('PRIVATE_QUERY_ERROR'); };
  await assert.rejects(readActiveFormMetadata(queryFailure), hasCode('PAGE_UNAVAILABLE'));
});

test('reader client rejects missing/malformed injection results and ignores other frames', async () => {
  for (const result of [null, {}, { fields: null }]) {
    await assert.rejects(readActiveFormMetadata(api({ result })), hasCode('READER_FAILED'));
  }
  const noMainFrame = api();
  noMainFrame.scripting.executeScript = async () => [{ frameId: 5, result: metadata }];
  await assert.rejects(readActiveFormMetadata(noMainFrame), hasCode('READER_FAILED'));
});
