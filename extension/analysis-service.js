import { readActiveFormMetadata } from './form-reader-client.js';
import { requestLocalAI } from './local-ai-client.js';
import { validateGuidance } from './ollama.js';
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
  if (['page', 'selection'].includes(result?.kind)) {
    if (result.source !== 'live' || !Array.isArray(result.sources)) throw new AnalysisError('INVALID_RESPONSE');
    validatePageGuidance(result, result.sources);
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
  if (scenario === 'live') {
    onStatus('Reading supported fields on this page…');
    const metadata = await readActiveFormMetadata();
    if (signal?.aborted) throw new AnalysisError('CANCELLED');
    onStatus(`Read ${metadata.fields.length} fields. Local AI is preparing your guidance…`);
    return validateAnalysis(await requestLocalAI('analyze', metadata, { signal }));
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
      return { title: 'Sample error: no form found', message: 'A connected reader would ask you to open a page with a form. To see sample results now, choose “Community workshop registration” and select Analyze again.' };
    case 'SAMPLE_AI_UNAVAILABLE':
      return { title: 'Sample error: AI unavailable', message: 'A connected assistant would ask you to check that Ollama is running and try again. For this demo, choose “Community workshop registration” and select Analyze.' };
    case 'INVALID_RESPONSE':
      return { title: 'We couldn’t use that response', message: 'The response was incomplete. Select Analyze to try again.' };
    case 'NO_FORM':
      return { title: 'No supported form found', message: 'Open a page with visible standard form fields, then select Analyze. Embedded forms and custom widgets may not be supported.' };
    case 'UNSUPPORTED_PAGE':
      return { title: 'This page can’t be analyzed', message: 'Open a regular website or the practice form. Browser settings, extension stores, PDFs, and local files are not supported.' };
    case 'PAGE_UNAVAILABLE':
      return { title: 'Allow access to this page', message: 'Click the Kaya Mode toolbar icon on the page you want to read, then select Analyze again. Access must be granted again when you switch websites.' };
    case 'NO_SELECTION':
      return { title: 'Select some page text first', message: 'Highlight a paragraph on the website, then choose Explain selected text and select Analyze. Text inside editable fields is excluded.' };
    case 'NO_CONTENT':
      return { title: 'No readable page content found', message: 'Try a page with visible text. Embedded pages, images, and PDFs are not supported.' };
    case 'AI_UNAVAILABLE':
      return { title: 'Ollama isn’t available', message: 'Start local Ollama using the setup guide, then select Check local AI and try Analyze again.' };
    case 'MODEL_MISSING':
      return { title: 'Download the local model first', message: 'Run ollama pull qwen2.5:3b as shown in the setup guide, then select Analyze again.' };
    case 'ORIGIN_BLOCKED':
      return { title: 'Allow Kaya Mode to use Ollama', message: 'Restart Ollama with Kaya Mode’s extension origin allowed. Follow the setup guide, then select Analyze again.' };
    case 'TIMEOUT':
    case 'MODEL_WARMUP':
      return { title: 'Local AI took too long', message: 'The model may still be loading. Warm it up using the setup guide, close other heavy apps, and select Analyze again.' };
    case 'AI_BUSY':
      return { title: 'Local AI is busy', message: 'Wait for the other analysis to finish, then select Analyze again.' };
    case 'CONNECTION_LOST':
      return { title: 'Analysis was interrupted', message: 'Select Analyze again. Keep Kaya Mode open until the result is ready.' };
    case 'READER_UNAVAILABLE':
    case 'READER_FAILED':
      return { title: 'Reload Kaya Mode', message: 'Reload the extension from your browser’s extensions page. Open a website with a form, then select Analyze.' };
    case 'CANCELLED':
      return { title: 'Analysis cancelled', message: 'Select Analyze whenever you’re ready to try again.' };
    default:
      return { title: 'Something went wrong', message: 'We couldn’t prepare your guidance. Select Analyze to try again.' };
  }
}
