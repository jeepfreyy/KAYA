const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_OCR_CHARACTERS = 6000;

export class ImageReadError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ImageReadError';
    this.code = code;
  }
}

export function validateImageFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new ImageReadError('INVALID_IMAGE');
  }
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new ImageReadError('IMAGE_TOO_LARGE');
  return file;
}

export function buildImageBlocks(value) {
  if (typeof value !== 'string') throw new ImageReadError('OCR_NO_TEXT');
  const clean = value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (clean.length < 2) throw new ImageReadError('OCR_NO_TEXT');
  const blocks = [];
  let truncated = clean.length > MAX_OCR_CHARACTERS;
  const text = clean.slice(0, MAX_OCR_CHARACTERS);
  const paragraphs = text.split(/\n{2,}|\n(?=[A-Z0-9])/).map((item) => item.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    for (let offset = 0; offset < paragraph.length && blocks.length < 40; offset += 700) {
      const chunk = paragraph.slice(offset, offset + 700).trim();
      if (chunk) blocks.push({ id: `s${blocks.length + 1}`, text: chunk });
    }
    if (blocks.length >= 40) { truncated = true; break; }
  }
  if (!blocks.length) throw new ImageReadError('OCR_NO_TEXT');
  return { kind: 'image', blocks, truncated };
}

export async function captureVisiblePage(chromeApi = globalThis.chrome) {
  if (!chromeApi?.tabs?.query || !chromeApi?.tabs?.captureVisibleTab) throw new ImageReadError('CAPTURE_UNAVAILABLE');
  try {
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.windowId)) throw new Error('No active window');
    const dataUrl = await chromeApi.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Invalid capture');
    return dataUrl;
  } catch {
    throw new ImageReadError('CAPTURE_FAILED');
  }
}

export async function recognizeImage(image, {
  signal,
  onProgress = () => {},
  tesseract = globalThis.Tesseract,
  runtime = globalThis.chrome?.runtime,
} = {}) {
  if (!tesseract?.createWorker || !runtime?.getURL) throw new ImageReadError('OCR_UNAVAILABLE');
  const manifestCsp = runtime.getManifest?.().content_security_policy?.extension_pages;
  if (runtime.getManifest && (typeof manifestCsp !== 'string' || !manifestCsp.includes("'wasm-unsafe-eval'"))) {
    throw new ImageReadError('OCR_RELOAD_REQUIRED');
  }
  if (signal?.aborted) throw new ImageReadError('CANCELLED');
  let worker;
  let aborted = false;
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      void worker?.terminate();
      reject(new ImageReadError('OCR_FAILED'));
    }, 45000);
  });
  const abort = () => {
    aborted = true;
    void worker?.terminate();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    worker = await Promise.race([tesseract.createWorker('eng', 1, {
      workerPath: runtime.getURL('vendor/tesseract/worker.min.js'),
      corePath: runtime.getURL('vendor/tesseract/core'),
      langPath: runtime.getURL('vendor/tesseract/lang'),
      workerBlobURL: false,
      cacheMethod: 'none',
      gzip: true,
      logger: ({ status, progress }) => {
        if (typeof progress === 'number') onProgress({ status, progress });
      },
      errorHandler: () => { void worker?.terminate(); },
    }), timeoutPromise]);
    if (aborted || signal?.aborted) throw new ImageReadError('CANCELLED');
    const result = await Promise.race([worker.recognize(image), timeoutPromise]);
    if (aborted || signal?.aborted) throw new ImageReadError('CANCELLED');
    const text = result?.data?.text;
    if (typeof text !== 'string' || text.trim().length < 2) throw new ImageReadError('OCR_NO_TEXT');
    return { text, confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null };
  } catch (error) {
    if (error instanceof ImageReadError) throw error;
    throw new ImageReadError(aborted || signal?.aborted ? 'CANCELLED' : 'OCR_FAILED');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    await worker?.terminate().catch(() => {});
  }
}
