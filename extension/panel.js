import { analyzeForm, getErrorMessage, validateAnalysis } from './analysis-service.js';
import { requestLocalAI } from './local-ai-client.js';
import { hideGuidedView, showGuidedView } from './guided-view-client.js';
import { buildImageBlocks, captureVisiblePage, recognizeImage, validateImageFile } from './image-ocr.js';

const ids = [
  'assistant', 'main-intro', 'privacy-note', 'task-picker', 'loading-row', 'loading-label', 'status', 'help-panel', 'error-card',
  'error-title', 'error-message', 'retry-button', 'results', 'results-title',
  'overview', 'overview-title', 'checklist', 'checklist-title', 'first-step',
  'first-step-title', 'mode-badge', 'result-source', 'result-meta', 'results-footnote',
  'cancel-button', 'check-ai', 'next-step-source', 'guide-form-button',
  'read-aloud-button', 'new-task-button', 'task-list', 'task-image', 'image-workflow',
  'capture-image', 'image-upload', 'image-preview', 'image-canvas', 'read-image', 'close-image',
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const taskButtons = [...document.querySelectorAll('.task-button')];
const scenarioButtons = taskButtons.filter((button) => button.dataset.scenario);

let isLoading = false;
let controller;
let generation = 0;
let lastScenario = 'page';
let currentResult;
let currentUtterance;
let sourceCanvas;
let cropRectangle;
let selectionStart;

function showResultsView(showResults) {
  for (const id of ['main-intro', 'privacy-note', 'status', 'help-panel']) {
    elements[id].hidden = showResults;
  }
  elements.assistant.dataset.view = showResults ? 'results' : 'main';
  if (showResults) elements['help-panel'].open = false;
}

function stopReading() {
  if ('speechSynthesis' in globalThis) globalThis.speechSynthesis.cancel();
  currentUtterance = undefined;
  elements['read-aloud-button'].textContent = 'Read this aloud';
  elements['read-aloud-button'].setAttribute('aria-pressed', 'false');
}

if (!('speechSynthesis' in globalThis) || !('SpeechSynthesisUtterance' in globalThis)) {
  elements['read-aloud-button'].hidden = true;
}

function resetImage() {
  sourceCanvas = undefined;
  cropRectangle = undefined;
  selectionStart = undefined;
  elements['image-upload'].value = '';
  elements['image-preview'].hidden = true;
  const context = elements['image-canvas'].getContext('2d');
  context?.clearRect(0, 0, elements['image-canvas'].width, elements['image-canvas'].height);
}

function closeImageWorkflow() {
  resetImage();
  elements['image-workflow'].hidden = true;
  elements['task-list'].hidden = false;
  elements.status.textContent = 'Choose an option above to begin.';
}

function openImageWorkflow() {
  elements['error-card'].hidden = true;
  elements['task-list'].hidden = true;
  elements['image-workflow'].hidden = false;
  elements.status.textContent = 'Take a screenshot or upload an image. Nothing is read until you choose “Read these words.”';
  document.getElementById('image-title').focus();
}

function drawImageSelection() {
  if (!sourceCanvas) return;
  const canvas = elements['image-canvas'];
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  const selection = cropRectangle || { x: 0, y: 0, width: canvas.width, height: canvas.height };
  context.fillStyle = 'rgba(12, 35, 25, .48)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, selection.x, selection.y, selection.width, selection.height,
    selection.x, selection.y, selection.width, selection.height);
  context.strokeStyle = '#e7ad3d';
  context.lineWidth = Math.max(3, canvas.width / 500);
  context.strokeRect(selection.x, selection.y, selection.width, selection.height);
}

async function loadImagePreview(dataUrl) {
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  }).catch(() => { throw Object.assign(new Error('Invalid image'), { code: 'INVALID_IMAGE' }); });
  if (!image.naturalWidth || !image.naturalHeight) throw Object.assign(new Error('Invalid image'), { code: 'INVALID_IMAGE' });
  const scale = Math.min(1, 2400 / image.naturalWidth, 2400 / image.naturalHeight,
    Math.sqrt(6_000_000 / (image.naturalWidth * image.naturalHeight)));
  sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  sourceCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  sourceCanvas.getContext('2d').drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  elements['image-canvas'].width = sourceCanvas.width;
  elements['image-canvas'].height = sourceCanvas.height;
  cropRectangle = { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };
  drawImageSelection();
  elements['image-preview'].hidden = false;
  elements.status.textContent = 'Image ready. You can drag around the words you need, then choose “Read these words.”';
  elements['read-image'].focus();
}

function selectedImageDataUrl() {
  if (!sourceCanvas || !cropRectangle) throw Object.assign(new Error('No image'), { code: 'INVALID_IMAGE' });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropRectangle.width));
  canvas.height = Math.max(1, Math.round(cropRectangle.height));
  canvas.getContext('2d').drawImage(sourceCanvas, cropRectangle.x, cropRectangle.y,
    cropRectangle.width, cropRectangle.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function canvasPoint(event) {
  const canvas = elements['image-canvas'];
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)),
  };
}

function setLoading(loading, scenario = lastScenario) {
  isLoading = loading;
  elements.assistant.setAttribute('aria-busy', String(loading));
  for (const button of taskButtons) button.disabled = loading;
  for (const id of ['check-ai', 'retry-button', 'guide-form-button', 'new-task-button',
    'capture-image', 'image-upload', 'read-image', 'close-image']) {
    elements[id].disabled = loading;
  }
  elements['loading-row'].hidden = !loading;
  elements['cancel-button'].hidden = !loading;
  if (loading) {
    elements['loading-label'].textContent = scenario === 'selection'
      ? 'Kaya is explaining the selected words…'
      : scenario === 'page' ? 'Kaya is simplifying this page…'
        : scenario === 'guided' ? 'Kaya is preparing the field-by-field guide…'
          : scenario === 'check' ? 'Checking if Kaya is ready…'
            : scenario === 'image' ? 'Kaya is reading the screenshot on this computer…'
          : 'Kaya is preparing your form guide…';
  }
}

function sourceExcerpt(source) {
  const details = document.createElement('details');
  details.className = 'source-excerpt';
  const summary = document.createElement('summary');
  summary.textContent = 'Compare with the original words';
  const quote = document.createElement('blockquote');
  quote.textContent = source.text;
  details.append(summary, quote);
  return details;
}

function renderResults(result) {
  validateAnalysis(result);
  currentResult = result;
  const page = ['page', 'selection', 'image'].includes(result.kind);
  const sample = result.source === 'sample';

  elements['result-source'].textContent = sample ? 'Practice guide' : "Kaya's guide";
  elements['mode-badge'].textContent = result.kind === 'guided' ? 'On the page' : 'Ready';
  elements['results-title'].textContent = result.kind === 'guided' ? 'Your field-by-field guide is ready' : 'Here is your simple guide';
  elements['result-meta'].textContent = sample ? 'Practice example · no page was read'
    : `${result.model} · ${(result.durationMs / 1000).toFixed(1)} seconds · ${page ? `${result.excerptCount} text sections` : `${result.fieldCount} form fields`}${result.kind === 'image' && Number.isFinite(result.ocrConfidence) ? ` · OCR ${Math.round(result.ocrConfidence)}%` : ''}${result.truncated ? ' · long content was shortened' : ''}`;
  elements['results-footnote'].textContent = sample ? 'This is only a practice example.'
    : result.kind === 'image' ? 'Kaya first recognized words in the image. Compare important details with the original screenshot; some words may be misread.'
      : page ? 'Kaya uses a snapshot of visible text. Compare important details with the original page.'
      : 'Kaya uses field labels and instructions—not the answers you type. Review the form before submitting.';
  elements['overview-title'].textContent = ['selection', 'image'].includes(result.kind) ? 'In simple words' : 'What this means';
  elements['checklist-title'].textContent = page ? 'Important points' : 'What to prepare';
  elements['first-step-title'].textContent = result.kind === 'guided' ? 'Look at the page' : 'Start here';
  elements.overview.textContent = page ? result.summary : result.overview;
  elements['first-step'].textContent = page ? result.nextStep : result.firstStep;
  elements.checklist.replaceChildren();
  elements['next-step-source'].replaceChildren();
  elements['next-step-source'].hidden = true;

  if (page) {
    const sources = new Map(result.sources.map((source) => [source.id, source]));
    for (const item of result.keyPoints) {
      const row = document.createElement('li');
      const content = document.createElement('div');
      const text = document.createElement('p');
      text.textContent = item.text;
      text.className = 'key-point-text';
      content.append(text, sourceExcerpt(sources.get(item.sourceId)));
      row.append(content);
      elements.checklist.append(row);
    }
    if (result.nextStepSourceId) {
      elements['next-step-source'].append(sourceExcerpt(sources.get(result.nextStepSourceId)));
      elements['next-step-source'].hidden = false;
    }
  } else {
    for (const item of result.preparationChecklist) {
      const row = document.createElement('li');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const text = document.createElement('span');
      text.textContent = item;
      label.append(checkbox, text);
      row.append(label);
      elements.checklist.append(row);
    }
  }

  elements['guide-form-button'].hidden = result.kind !== 'form';
  showResultsView(true);
  elements['task-picker'].hidden = true;
  elements.results.hidden = false;
}

function showError(error) {
  const { title, message } = getErrorMessage(error);
  elements['error-title'].textContent = title;
  elements['error-message'].textContent = message;
  elements['error-card'].hidden = false;
  showResultsView(false);
  elements['task-picker'].hidden = false;
  elements.status.textContent = error.code === 'CANCELLED'
    ? 'Cancelled. You can choose an option whenever you are ready.'
    : 'Follow the message below, then try again.';
}

async function runAnalysis(scenario) {
  if (isLoading) return;
  lastScenario = scenario;
  const current = ++generation;
  stopReading();
  elements['error-card'].hidden = true;
  elements.results.hidden = true;
  elements['task-picker'].hidden = false;
  controller = new AbortController();
  setLoading(true, scenario);
  if (scenario !== 'guided') await hideGuidedView();
  if (current !== generation) return;
  elements.status.textContent = scenario === 'selection'
    ? 'Reading only the words you highlighted…'
    : scenario === 'page' ? 'Reading the visible text on this page…'
      : 'Reading form labels and instructions—not your answers…';

  try {
    const result = await analyzeForm({
      scenario,
      signal: controller.signal,
      onStatus: (message) => { if (current === generation) elements.status.textContent = message; },
    });
    if (current !== generation) return;
    if (result.kind === 'guided') await showGuidedView(result);
    if (current !== generation) return;
    renderResults(result);
    elements.status.textContent = result.kind === 'guided'
      ? 'The guide is now beside the original form fields. Kaya did not fill or submit anything.'
      : 'Your guide is ready below.';
    elements['results-title'].focus();
  } catch (error) {
    if (current === generation) showError(error);
  } finally {
    if (current === generation) setLoading(false, scenario);
  }
}

async function runImageAnalysis() {
  if (isLoading || !sourceCanvas) return;
  lastScenario = 'image';
  const current = ++generation;
  stopReading();
  elements['error-card'].hidden = true;
  elements.results.hidden = true;
  controller = new AbortController();
  setLoading(true, 'image');
  elements.status.textContent = 'Finding words in the selected part of the image…';
  try {
    const ocr = await recognizeImage(selectedImageDataUrl(), {
      signal: controller.signal,
      onProgress: ({ status, progress }) => {
        if (current !== generation || status !== 'recognizing text') return;
        elements.status.textContent = `Reading words locally… ${Math.round(progress * 100)}%`;
      },
    });
    if (current !== generation) return;
    const metadata = buildImageBlocks(ocr.text);
    elements.status.textContent = 'Words found. Local AI is preparing a simple explanation…';
    const result = await requestLocalAI('analyze', metadata, { signal: controller.signal });
    if (current !== generation) return;
    renderResults({ ...result, ocrConfidence: ocr.confidence });
    elements.status.textContent = 'Your screenshot guide is ready below.';
    elements['results-title'].focus();
  } catch (error) {
    if (current === generation) showError(error);
  } finally {
    if (current === generation) setLoading(false, 'image');
  }
}

function reset(message = 'Choose an option above to begin.') {
  generation += 1;
  controller?.abort();
  stopReading();
  currentResult = undefined;
  setLoading(false);
  elements.results.hidden = true;
  elements['error-card'].hidden = true;
  showResultsView(false);
  elements['task-picker'].hidden = false;
  closeImageWorkflow();
  elements.status.textContent = message;
  void hideGuidedView();
}

for (const button of scenarioButtons) {
  button.addEventListener('click', () => void runAnalysis(button.dataset.scenario));
}
elements['task-image'].addEventListener('click', openImageWorkflow);
elements['close-image'].addEventListener('click', closeImageWorkflow);
elements['capture-image'].addEventListener('click', async () => {
  if (isLoading) return;
  elements['error-card'].hidden = true;
  elements.status.textContent = 'Taking a screenshot of the visible webpage…';
  try {
    await loadImagePreview(await captureVisiblePage());
  } catch (error) { showError(error); }
});
elements['image-upload'].addEventListener('change', async () => {
  const [file] = elements['image-upload'].files;
  if (!file) return;
  elements['error-card'].hidden = true;
  try {
    validateImageFile(file);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await loadImagePreview(dataUrl);
  } catch (error) { showError(error); }
});
elements['read-image'].addEventListener('click', () => void runImageAnalysis());
elements['image-canvas'].addEventListener('pointerdown', (event) => {
  if (!sourceCanvas || isLoading) return;
  selectionStart = canvasPoint(event);
  cropRectangle = { ...selectionStart, width: 1, height: 1 };
  elements['image-canvas'].setPointerCapture(event.pointerId);
});
elements['image-canvas'].addEventListener('pointermove', (event) => {
  if (!selectionStart || !sourceCanvas || isLoading) return;
  const point = canvasPoint(event);
  cropRectangle = {
    x: Math.min(selectionStart.x, point.x),
    y: Math.min(selectionStart.y, point.y),
    width: Math.abs(point.x - selectionStart.x),
    height: Math.abs(point.y - selectionStart.y),
  };
  drawImageSelection();
});
elements['image-canvas'].addEventListener('pointerup', () => {
  if (!sourceCanvas) return;
  if (!cropRectangle || cropRectangle.width < 12 || cropRectangle.height < 12) {
    cropRectangle = { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };
  }
  selectionStart = undefined;
  drawImageSelection();
});
elements['guide-form-button'].addEventListener('click', () => void runAnalysis('guided'));
elements['retry-button'].addEventListener('click', () => {
  if (lastScenario === 'image') void runImageAnalysis();
  else void runAnalysis(lastScenario);
});
elements['new-task-button'].addEventListener('click', () => {
  reset();
  document.getElementById('task-title').focus();
});
elements['cancel-button'].addEventListener('click', () => controller?.abort());

elements['read-aloud-button'].addEventListener('click', () => {
  if (currentUtterance) {
    stopReading();
    elements.status.textContent = 'Reading stopped.';
    return;
  }
  if (!currentResult || !('speechSynthesis' in globalThis)) return;
  const isTextGuide = ['page', 'selection', 'image'].includes(currentResult.kind);
  const points = isTextGuide
    ? currentResult.keyPoints.map((item) => item.text)
    : currentResult.preparationChecklist;
  const overview = isTextGuide
    ? currentResult.summary : currentResult.overview;
  const firstStep = isTextGuide
    ? currentResult.nextStep : currentResult.firstStep;
  const utterance = new SpeechSynthesisUtterance(`Start here. ${firstStep}. What this means. ${overview}. Helpful points. ${points.join('. ')}`);
  utterance.lang = 'en-PH';
  utterance.rate = 0.92;
  utterance.onend = () => { if (currentUtterance === utterance) stopReading(); };
  utterance.onerror = () => { if (currentUtterance === utterance) stopReading(); };
  currentUtterance = utterance;
  elements['read-aloud-button'].textContent = 'Stop reading';
  elements['read-aloud-button'].setAttribute('aria-pressed', 'true');
  elements.status.textContent = 'Reading the guide aloud.';
  globalThis.speechSynthesis.speak(utterance);
});

elements['check-ai'].addEventListener('click', async () => {
  if (isLoading) return;
  const current = ++generation;
  elements['error-card'].hidden = true;
  controller = new AbortController();
  setLoading(true, 'check');
  elements.status.textContent = 'Checking if Kaya is ready…';
  try {
    const result = await requestLocalAI('check', undefined, { signal: controller.signal });
    if (current === generation) {
      elements.status.textContent = `Kaya is ready on this computer (${result.model}). Choose an option above.`;
    }
  } catch (error) {
    if (current === generation) showError(error);
  } finally {
    if (current === generation) setLoading(false);
  }
});

// A side panel outlives page navigation. Never leave another tab's answer visible.
globalThis.chrome?.tabs?.onActivated?.addListener(() => {
  reset('You switched tabs. Open Kaya again on the page where you want help.');
});
globalThis.chrome?.tabs?.onUpdated?.addListener((_id, change, tab) => {
  if (tab.active && (change.status === 'loading' || change.url)) {
    reset('The page changed. Open Kaya again when the page is ready.');
  }
});
