import { analyzeForm, getErrorMessage, validateAnalysis } from './analysis-service.js';
import { requestLocalAI } from './local-ai-client.js';

const elements = Object.fromEntries([
  'assistant', 'analyze-form', 'scenario', 'analyze-button', 'button-label',
  'spinner', 'button-arrow', 'status', 'error', 'error-title', 'error-message',
  'results', 'results-title', 'overview', 'checklist', 'first-step',
  'mode-badge', 'notice-title', 'notice-copy', 'result-source', 'result-meta',
  'results-footnote', 'cancel-button', 'check-ai', 'overview-title',
  'checklist-title', 'checklist-hint', 'first-step-title', 'next-step-source',
].map((id) => [id, document.getElementById(id)]));
let isLoading = false;
let controller;
let generation = 0;
const isSample = () => !['page', 'selection', 'live'].includes(elements.scenario.value);

function setLoading(loading) {
  isLoading = loading;
  elements.assistant.setAttribute('aria-busy', String(loading));
  for (const id of ['analyze-button', 'scenario', 'check-ai']) elements[id].disabled = loading;
  elements['cancel-button'].hidden = !loading;
  elements.spinner.hidden = !loading;
  elements['button-arrow'].hidden = loading;
  elements['button-label'].textContent = loading ? 'Preparing guidance…' : 'Analyze';
}

function sourceExcerpt(source) {
  const details = document.createElement('details');
  details.className = 'source-excerpt';
  const summary = document.createElement('summary');
  summary.textContent = 'Read the original text';
  const quote = document.createElement('blockquote');
  quote.textContent = source.text;
  details.append(summary, quote);
  return details;
}

function renderResults(result) {
  validateAnalysis(result);
  const sample = result.source === 'sample';
  const page = ['page', 'selection'].includes(result.kind);
  elements['result-source'].textContent = sample ? 'SAMPLE AI RESPONSE' : 'LOCAL AI RESPONSE';
  elements['result-meta'].textContent = sample ? 'Fictional example · no page was read'
    : `${result.model} · ${(result.durationMs / 1000).toFixed(1)}s · ${page ? `${result.excerptCount} text excerpts` : `${result.fieldCount} fields`}${result.truncated ? ' · content shortened' : ''}`;
  elements['results-footnote'].textContent = sample ? 'Example only. Always follow the actual form’s instructions.'
    : page ? 'Based on a snapshot of readable text, not the entire website. Compare the original excerpts; AI can make mistakes.'
      : 'Based on supported fields only. Check the actual form’s instructions; AI can make mistakes.';
  elements['overview-title'].textContent = result.kind === 'selection' ? 'In plain language' : 'Overview';
  elements['checklist-title'].textContent = page ? 'What matters' : 'Preparation checklist';
  elements['checklist-hint'].textContent = page ? 'Open an excerpt to compare it with the explanation.' : 'Check things off as you get ready.';
  elements['first-step-title'].textContent = page ? 'Your next step' : 'First step';
  elements.overview.textContent = page ? result.summary : result.overview;
  elements['first-step'].textContent = page ? result.nextStep : result.firstStep;
  elements.checklist.replaceChildren();
  elements['next-step-source'].replaceChildren();
  if (page) {
    const sources = new Map(result.sources.map((source) => [source.id, source]));
    for (const item of result.keyPoints) {
      const row = document.createElement('li');
      row.className = 'key-point';
      const text = document.createElement('p');
      text.textContent = item.text;
      row.append(text, sourceExcerpt(sources.get(item.sourceId)));
      elements.checklist.append(row);
    }
    if (result.nextStepSourceId) elements['next-step-source'].append(sourceExcerpt(sources.get(result.nextStepSourceId)));
  } else {
    for (const item of result.preparationChecklist) {
      const row = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const text = document.createElement('span');
      text.textContent = item;
      label.append(checkbox, text); row.append(label); elements.checklist.append(row);
    }
  }
  elements.results.hidden = false;
}

function showError(error) {
  const { title, message } = getErrorMessage(error);
  elements['error-title'].textContent = title;
  elements['error-message'].textContent = message;
  elements.error.hidden = false;
  elements.status.textContent = error.code === 'CANCELLED' ? 'Cancelled. You can try again anytime.' : 'See the message below, then try again.';
}

elements['analyze-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isLoading) return;
  const current = ++generation;
  elements.error.hidden = true;
  elements.results.hidden = true;
  setLoading(true);
  controller = new AbortController();
  const sample = isSample();
  elements.status.textContent = sample ? 'Preparing a sample response. No page content is being read.' : 'Reading this page…';
  try {
    const result = await analyzeForm({ scenario: elements.scenario.value, signal: controller.signal,
      onStatus: (message) => { if (current === generation) elements.status.textContent = message; } });
    if (current !== generation) return;
    renderResults(result);
    elements.status.textContent = `${sample ? 'Sample' : 'Explanation'} ready. Read your guidance below.`;
    elements['results-title'].focus();
  } catch (error) {
    if (current === generation) showError(error);
  } finally { if (current === generation) setLoading(false); }
});

function reset(message) {
  generation++;
  controller?.abort();
  setLoading(false);
  elements.results.hidden = true;
  elements.error.hidden = true;
  elements.status.textContent = message;
}

elements.scenario.addEventListener('change', () => {
  const sample = isSample();
  reset(sample ? 'Sample selected. Select Analyze when you’re ready.'
    : elements.scenario.value === 'selection' ? 'Highlight a paragraph on the website, then select Analyze.'
      : 'Select Analyze to read the current page.');
  elements['mode-badge'].textContent = sample ? 'SAMPLE MODE' : 'LOCAL AI';
  elements['notice-title'].textContent = sample ? 'Sample AI responses · demo only' : 'On your computer. At your pace.';
  elements['notice-copy'].textContent = sample
    ? 'Fictional examples, not analysis of this page. No page content is read or sent in sample mode.'
    : elements.scenario.value === 'live'
      ? 'Only field labels and requirements go to local Ollama. Entered values, passwords, and uploaded files are excluded.'
      : 'Visible page text goes to local Ollama only when you select Analyze. Text in input fields is excluded. Personal details already printed on the page may be included.';
});
elements['cancel-button'].addEventListener('click', () => controller?.abort());
elements['check-ai'].addEventListener('click', async () => {
  if (isLoading) return;
  const current = ++generation;
  elements.error.hidden = true;
  controller = new AbortController();
  setLoading(true);
  elements.status.textContent = 'Checking local Ollama and the model…';
  try {
    const result = await requestLocalAI('check', undefined, { signal: controller.signal });
    if (current === generation) elements.status.textContent = `${result.model} is available locally. Select Analyze to get started.`;
  } catch (error) { if (current === generation) showError(error); }
  finally { if (current === generation) setLoading(false); }
});

// A side panel outlives page navigation. Never leave another tab's answer visible.
globalThis.chrome?.tabs?.onActivated?.addListener(() => {
  reset('You switched tabs. Click Kaya’s toolbar icon to allow access, then select Analyze.');
});
globalThis.chrome?.tabs?.onUpdated?.addListener((_id, change, tab) => {
  if (tab.active && (change.status === 'loading' || change.url)) {
    reset('The page changed. Click Kaya’s toolbar icon to allow access, then select Analyze.');
  }
});
