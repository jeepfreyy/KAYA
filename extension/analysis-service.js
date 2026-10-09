import { readActiveFormMetadata } from './form-reader-client.js';
import { requestLocalAI } from './local-ai-client.js';
import { validateGuidance, validateGuidedView } from './ollama.js';
import { readActivePage } from './page-reader-client.js';
import { validatePageGuidance } from './page-analysis.js';

/** @typedef {{source: 'sample'|'live', overview: string, preparationChecklist: string[], firstStep: string}} AnalysisResult */

export class AnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

export function validateAnalysis(result) {
  if (['page', 'selection', 'image'].includes(result?.kind)) {
    if (result.source !== 'live' || !Array.isArray(result.sources)) throw new AnalysisError('INVALID_RESPONSE');
    validatePageGuidance(result, result.sources);
    return result;
  }
  if (result?.kind === 'guided') {
    if (result.source !== 'live' || !Number.isInteger(result.fieldCount) || result.fieldCount < 1) throw new AnalysisError('INVALID_RESPONSE');
    validateGuidedView(result, Array.from({ length: result.fieldCount }));
    return result;
  }
  validateGuidance(result);
  const isText = (value) => typeof value === 'string' && value.trim().length > 0;
  if (!result || !['sample', 'live'].includes(result.source)
    || !isText(result.overview) || !isText(result.firstStep)
    || !Array.isArray(result.preparationChecklist)
    || result.preparationChecklist.length === 0
    || !result.preparationChecklist.every(isText)) {
    throw new AnalysisError('INVALID_RESPONSE', 'The response is missing required guidance.');
  }
  return result;
}

/** @returns {Promise<AnalysisResult>} */
export async function analyzeForm({ scenario = 'page', signal, onStatus = () => {} } = {}) {
  if (['page', 'selection'].includes(scenario)) {
    onStatus(scenario === 'page' ? 'Reading the main visible page content…' : 'Reading your selected text…');
    const metadata = await readActivePage(scenario);
    if (signal?.aborted) throw new AnalysisError('CANCELLED');
    onStatus('Local AI is simplifying the text…');
    return validateAnalysis(await requestLocalAI('analyze', metadata, { signal }));
  }
  if (['live', 'guided'].includes(scenario)) {
    onStatus('Reading supported fields on this page…');
    const metadata = await readActiveFormMetadata();
    if (signal?.aborted) throw new AnalysisError('CANCELLED');
    onStatus(`Read ${metadata.fields.length} fields. Local AI is preparing ${scenario === 'guided' ? 'a guided view' : 'your guidance'}…`);
    const input = scenario === 'guided' ? { kind: 'guided', fields: metadata.fields } : metadata;
    const result = validateAnalysis(await requestLocalAI('analyze', input, { signal }));
    return scenario === 'guided' ? { ...result, fieldMetadata: metadata.fields } : result;
  }
  // Intentional demo delay so the loading state can be reviewed without a model.
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (signal?.aborted) throw new AnalysisError('CANCELLED');

  if (scenario === 'no-form') {
    throw new AnalysisError('SAMPLE_NO_FORM', 'Sample error: no form found.');
  }
  if (scenario === 'unavailable') {
    throw new AnalysisError('SAMPLE_AI_UNAVAILABLE', 'Sample error: AI unavailable.');
  }
  if (scenario !== 'success') {
    throw new AnalysisError('INVALID_SCENARIO', 'Choose an available sample.');
  }

  return validateAnalysis({
    source: 'sample',
    overview: 'This fictional form reserves a place at a community workshop. It asks for your name, contact email, and preferred session so the organizer can confirm your registration.',
    preparationChecklist: [
      'The name you want on your registration.',
      'An email address where you can receive a confirmation.',
      'Your preferred workshop session and a backup choice.',
    ],
    firstStep: 'For this example, start with the “Full name” field. Enter the name you want the organizer to use, then move to your contact email.',
  });
}

export function getErrorMessage(error) {
  switch (error?.code) {
    case 'SAMPLE_NO_FORM':
      return { title: 'Sample error: no form found', message: 'Open a page with a visible form, then choose “Help me with a form.”' };
    case 'SAMPLE_AI_UNAVAILABLE':
      return { title: 'Sample error: AI unavailable', message: 'Open “Need help getting started?”, check if Kaya is ready, then try again.' };
    case 'INVALID_RESPONSE':
      return { title: 'We couldn’t use that response', message: 'The guide was incomplete. Choose “Try again.”' };
    case 'NO_FORM':
      return { title: 'No supported form found', message: 'Open a page with a visible form, then choose “Help me with a form.” Some embedded forms may not work.' };
    case 'UNSUPPORTED_PAGE':
      return { title: 'This page can’t be analyzed', message: 'Open a regular website or the practice form. Browser settings, extension stores, PDFs, and local files are not supported.' };
    case 'PAGE_UNAVAILABLE':
      return { title: 'Allow access to this page', message: 'Open Kaya from the browser toolbar while viewing the page you want help with, then try again.' };
    case 'NO_SELECTION':
      return { title: 'Select some page text first', message: 'Highlight the confusing words on the website, then choose “Explain selected words.”' };
    case 'NO_CONTENT':
      return { title: 'No readable page content found', message: 'Try a page with visible text. Embedded pages, images, and PDFs are not supported.' };
    case 'INVALID_IMAGE':
      return { title: 'That image could not be opened', message: 'Choose a PNG, JPEG, or WebP screenshot and try again.' };
    case 'IMAGE_TOO_LARGE':
      return { title: 'That image is too large', message: 'Choose an image smaller than 10 MB, or take a new screenshot of only the area you need.' };
    case 'CAPTURE_UNAVAILABLE':
    case 'CAPTURE_FAILED':
      return { title: 'Screenshot could not be taken', message: 'Keep the page open, reopen Kaya from the browser toolbar, then try again. You can also upload an image.' };
    case 'OCR_NO_TEXT':
      return { title: 'No clear words were found', message: 'Crop closer to the words, or upload a sharper image with larger text.' };
    case 'OCR_UNAVAILABLE':
    case 'OCR_FAILED':
      return { title: 'The image could not be read', message: 'Reload Kaya from your browser’s extensions page, then try the screenshot again.' };
    case 'OCR_RELOAD_REQUIRED':
      return { title: 'Reload the Kaya update', message: 'Chrome is still using the older Kaya version. Open the Extensions page, select Reload on Kaya Mode, then take the screenshot again.' };
    case 'AI_UNAVAILABLE':
      return { title: 'Kaya is not ready yet', message: 'Open “Need help getting started?”, follow the setup guide, then choose “Check if Kaya is ready.”' };
    case 'MODEL_MISSING':
      return { title: 'Finish the one-time setup', message: 'Open the setup guide and download the local model, then try again.' };
    case 'ORIGIN_BLOCKED':
      return { title: 'Allow Kaya to connect', message: 'Follow the connection step in the setup guide, restart the local AI, then try again.' };
    case 'TIMEOUT':
    case 'MODEL_WARMUP':
      return { title: 'Kaya needs more time', message: 'Wait a moment, close other heavy apps if needed, then choose “Try again.”' };
    case 'AI_BUSY':
      return { title: 'Kaya is busy', message: 'Wait for the other guide to finish, then choose “Try again.”' };
    case 'CONNECTION_LOST':
      return { title: 'The guide was interrupted', message: 'Keep Kaya open, then choose “Try again.”' };
    case 'READER_UNAVAILABLE':
    case 'READER_FAILED':
      return { title: 'Reload Kaya Mode', message: 'Reload Kaya from your browser’s extensions page, return to the website, then try again.' };
    case 'CANCELLED':
      return { title: 'Guide cancelled', message: 'Choose an option whenever you are ready.' };
    default:
      return { title: 'Something went wrong', message: 'We couldn’t prepare your guide. Choose “Try again.”' };
  }
}
