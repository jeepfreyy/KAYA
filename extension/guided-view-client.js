import { FormReaderError } from './form-reader-client.js';
import { applyGuidedView } from './guided-view.js';

export async function showGuidedView(plan, chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) throw new FormReaderError('READER_UNAVAILABLE');
  let tab;
  try { [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true }); }
  catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
  if (!Number.isInteger(tab?.id)) throw new FormReaderError('PAGE_UNAVAILABLE');
  try {
    const results = await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED', func: applyGuidedView, args: [plan] });
    const applied = results.find((entry) => entry.frameId === 0)?.result?.appliedCount;
    if (!Number.isInteger(applied) || applied < 1) throw new Error('No fields were available');
    return applied;
  } catch { throw new FormReaderError('PAGE_UNAVAILABLE'); }
}

export async function hideGuidedView(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query || !chromeApi?.scripting?.executeScript) return;
  try {
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (Number.isInteger(tab?.id)) await chromeApi.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED', func: applyGuidedView, args: [null] });
  } catch { /* The page may have navigated or access may have expired. */ }
}
