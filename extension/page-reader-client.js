import { readPageContent } from './page-reader.js';
import { FormReaderError } from './form-reader-client.js';

export async function readActivePage(mode, chromeApi = globalThis.chrome) {
  if (!['page', 'selection'].includes(mode)) throw new FormReaderError('INVALID_METADATA', 'Choose a supported reading mode.');
  if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) throw new FormReaderError('READER_UNAVAILABLE');
  let tab;
  try { [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true }); }
  catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
  if (!Number.isInteger(tab?.id)) throw new FormReaderError('PAGE_UNAVAILABLE');
  let url;
  try { url = new URL(tab.url); } catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.hostname === 'chromewebstore.google.com'
    || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
    || (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))) throw new FormReaderError('UNSUPPORTED_PAGE');
  let result;
  try {
    const injections = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED', func: readPageContent, args: [mode] });
    result = injections.find((item) => item.frameId === 0)?.result;
  } catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
  if (!Array.isArray(result?.blocks)) throw new FormReaderError('READER_FAILED');
  if (!result.blocks.length) throw new FormReaderError(mode === 'selection' ? 'NO_SELECTION' : 'NO_CONTENT');
  return result;
}
