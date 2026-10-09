import { readFormMetadata } from './form-reader.js';

export class FormReaderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FormReaderError';
    this.code = code;
  }
}

/** Call from the side panel after a user gesture, once activeTab + scripting are enabled. */
export async function readActiveFormMetadata(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) {
    throw new FormReaderError('READER_UNAVAILABLE', 'The form reader needs extension access. Enable activeTab and scripting in the manifest.');
  }
  let tab;
  try {
    [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  } catch {
    throw new FormReaderError('PAGE_UNAVAILABLE', 'We couldn’t access the active tab. Reopen Kaya Mode and try again.');
  }
  if (!Number.isInteger(tab?.id)) {
    throw new FormReaderError('PAGE_UNAVAILABLE', 'Open a web page with a form and try again.');
  }
  let url;
  try { url = new URL(tab.url); } catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
  if (!url || !['http:', 'https:'].includes(url.protocol)
    || url.hostname === 'chromewebstore.google.com'
    || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
    || (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))) {
    throw new FormReaderError('UNSUPPORTED_PAGE', 'Open a regular HTTP or HTTPS page with a form. Browser settings, extension stores, and local files are not supported.');
  }
  let results;
  try {
    results = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED',
      func: readFormMetadata,
    });
  } catch {
    throw new FormReaderError('PAGE_UNAVAILABLE', 'This page could not be read. It may be restricted or may have navigated. Reopen Kaya Mode on the form and try again.');
  }
  const metadata = results?.find((entry) => entry.frameId === 0)?.result;
  if (!metadata || !Array.isArray(metadata.fields)) {
    throw new FormReaderError('READER_FAILED', 'The form reader returned an invalid result. Reload the extension and try again.');
  }
  if (metadata.fields.length === 0) {
    throw new FormReaderError('NO_FORM', 'No supported visible fields were found. Open a form with standard input, select, or text area fields and try again.');
  }
  return metadata;
}
