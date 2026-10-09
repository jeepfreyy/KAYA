/** Self-contained isolated content-script function. Never read input values. */
export function readPageContent(mode = 'page') {
  const excluded = 'input,textarea,select,option,button,script,style,noscript,template,svg,canvas,iframe,[contenteditable]:not([contenteditable="false"]),[hidden],[inert],[aria-hidden="true"]';
  const visible = (element) => {
    if (!element || element.closest(excluded)) return false;
    for (let item = element; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  };
  const clean = (value) => value.replace(/\s+/g, ' ').trim();
  const blocks = [];
  let characters = 0;
  let truncated = false;
  const add = (text) => {
    text = clean(text);
    if (!text) return;
    const room = Math.min(700, 6000 - characters);
    if (room <= 0 || blocks.length >= 40) { truncated = true; return; }
    if (text.length > room) truncated = true;
    const clipped = text.slice(0, room);
    blocks.push({ id: `s${blocks.length + 1}`, text: clipped });
    characters += clipped.length;
  };
  if (mode === 'selection') {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return { kind: mode, blocks: [], truncated: false };
    const range = selection.getRangeAt(0);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const pieces = [];
    let scanned = 0;
    let length = 0;
    while (walker.nextNode()) {
      if (scanned++ >= 20000) { truncated = true; break; }
      const node = walker.currentNode;
      if (!visible(node.parentElement) || !range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent.length;
      const text = node.textContent.slice(start, end);
      const room = 6000 - length;
      pieces.push(text.slice(0, room)); length += Math.min(text.length, room);
      if (text.length > room || length >= 6000) { truncated = true; break; }
    }
    const text = clean(pieces.join(' '));
    // Keep selected text in bounded chunks without silently dropping its tail.
    for (let index = 0; index < text.length; index += 700) add(text.slice(index, index + 700));
  } else {
    const main = [...document.querySelectorAll('main,[role="main"],article')].find(visible) || document.body;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let scanned = 0;
    let parent = null;
    let text = '';
    while (walker.nextNode()) {
      if (scanned++ >= 20000) { truncated = true; break; }
      const node = walker.currentNode;
      if (!visible(node.parentElement) || node.parentElement.closest('nav,header,footer,[role="navigation"]')) continue;
      const container = node.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,dt,dd,td,th,legend,label,section,div') || node.parentElement;
      if (container !== parent) { add(text); text = ''; parent = container; }
      text += ` ${node.textContent.slice(0, 701)}`;
      if (text.length > 700) { add(text); text = ''; }
      if (characters >= 6000 || blocks.length >= 40) { truncated = true; break; }
    }
    add(text);
  }
  return { kind: mode, blocks, truncated };
}
