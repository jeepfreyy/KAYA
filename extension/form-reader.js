/**
 * Member 2: self-contained function executed as an isolated content script with
 * chrome.scripting.executeScript({ target: { tabId }, func: readFormMetadata }).
 * Keep all dependencies inside the function: Chrome serializes its source.
 * Returns only the shared { fields } contract; never reads control values.
 */
export function readFormMetadata() {
  const MAX_FIELDS = 50;
  const MAX_CANDIDATES = 500;
  const MAX_TEXT = 200;
  const MAX_OPTIONS = 30;
  const supportedInputs = new Set([
    'text', 'email', 'tel', 'url', 'search', 'number', 'date', 'datetime-local',
    'month', 'week', 'time', 'checkbox', 'radio', 'file', 'range', 'color',
  ]);
  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

  function isVisible(element) {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden'
        || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  }

  // Do not use label.textContent: wrapped controls can contain a textarea's
  // initial text, editable content, or the selected option's user data.
  function labelText(element) {
    if (!element) return '';
    const chunks = [];
    let size = 0;
    let visited = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && (
          node.matches('input, textarea, select, option, script, style, template')
          || node.isContentEditable || node.closest('[contenteditable]:not([contenteditable="false"])')
        )) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    if (element.matches('input, textarea, select, option, script, style, template')
      || element.isContentEditable || element.closest('[contenteditable]:not([contenteditable="false"])')) return '';
    while (walker.nextNode() && visited++ < 1000 && size < MAX_TEXT * 4) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.slice(0, MAX_TEXT * 4 - size);
        chunks.push(text);
        size += text.length;
      }
    }
    return normalize(chunks.join(' '));
  }

  function fieldLabel(element) {
    const native = normalize(Array.from(element.labels || []).slice(0, 10).map(labelText).join(' '));
    if (native) return native;
    const ids = (element.getAttribute('aria-labelledby') || '').trim().split(/\s+/).slice(0, 10);
    const accessible = normalize(ids.map((id) => labelText(document.getElementById(id))).join(' '));
    if (accessible) return accessible;
    const aria = normalize(element.getAttribute('aria-label'));
    if (aria) return aria;

    // Angular Material and similar libraries often render a floating label in
    // the field container without connecting it through for/aria-labelledby.
    const previous = element.previousElementSibling;
    if (previous?.matches('label, mat-label')) {
      const nearby = labelText(previous);
      if (nearby) return nearby;
    }
    let container = element.closest('md-input-container, mat-form-field, .mat-form-field');
    if (!container) {
      const candidate = element.closest('.form-field, .form-group');
      if (candidate?.querySelectorAll('input, textarea, select').length === 1) container = candidate;
    }
    if (!container || container.querySelectorAll('input, textarea, select').length !== 1) return '';
    return normalize(Array.from(container.querySelectorAll('label, mat-label')).slice(0, 10).map(labelText).join(' '));
  }

  const fields = [];
  let scanned = 0;
  for (const element of document.querySelectorAll('input, textarea, select')) {
    if (scanned++ >= MAX_CANDIDATES || fields.length >= MAX_FIELDS) break;
    const tag = element.localName;
    const type = tag === 'input' ? element.type : tag;
    if (tag === 'input' && !supportedInputs.has(type)) continue;
    if (!isVisible(element)) continue;

    const options = [];
    if (tag === 'select') {
      let optionCount = 0;
      for (const option of element.options) {
        if (optionCount++ >= MAX_CANDIDATES || options.length >= MAX_OPTIONS) break;
        if (option.hidden || option.closest('[hidden]')) continue;
        // Option labels are metadata; never return value/selected/selectedIndex.
        options.push(normalize(option.getAttribute('label')) || normalize(option.textContent));
      }
    }
    fields.push({
      label: fieldLabel(element),
      type,
      required: element.required || element.getAttribute('aria-required') === 'true',
      placeholder: normalize(element.getAttribute('placeholder')),
      options,
    });
  }
  return { fields };
}
