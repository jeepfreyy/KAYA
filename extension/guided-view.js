/**
 * Self-contained isolated content-script function. It never reads or changes a
 * control value. The website's original controls stay in their original DOM.
 */
export function applyGuidedView(plan) {
  const HOST_ID = '__kaya_mode_guided_view_v1__';
  const STYLE_ID = '__kaya_mode_guided_view_style_v1__';
  const ACTIVE = 'data-kaya-mode-guided-active-v1';
  const cleanExisting = () => {
    document.querySelector(`#${HOST_ID}[data-kaya-owned="true"]`)?.remove();
    document.querySelector(`#${STYLE_ID}[data-kaya-owned="true"]`)?.remove();
    document.querySelectorAll(`[${ACTIVE}]`).forEach((element) => element.removeAttribute(ACTIVE));
  };
  cleanExisting();

  if (!plan || !Array.isArray(plan.fieldGuidance) || !plan.fieldGuidance.length) {
    return { appliedCount: 0 };
  }

  const supported = new Set([
    'text', 'email', 'tel', 'url', 'search', 'number', 'date', 'datetime-local',
    'month', 'week', 'time', 'checkbox', 'radio', 'file', 'range', 'color',
  ]);
  const visible = (element) => {
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let item = element; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === 'none' || style.visibility === 'hidden'
        || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  };
  const fields = [];
  let scanned = 0;
  for (const element of document.querySelectorAll('input, textarea, select')) {
    if (scanned++ >= 500 || fields.length >= 50) break;
    const type = element.localName === 'input' ? element.type : element.localName;
    if (element.localName === 'input' && !supported.has(type)) continue;
    if (visible(element)) fields.push(element);
  }
  const steps = plan.fieldGuidance.filter((item) => Number.isInteger(item.fieldIndex)
    && item.fieldIndex >= 0 && item.fieldIndex < fields.length)
    .sort((first, second) => first.fieldIndex - second.fieldIndex);
  if (!steps.length) return { appliedCount: 0 };

  const pageStyle = document.createElement('style');
  pageStyle.id = STYLE_ID;
  pageStyle.dataset.kayaOwned = 'true';
  pageStyle.textContent = `[${ACTIVE}] { outline: 4px solid #a8cf45 !important; outline-offset: 5px !important; box-shadow: 0 0 0 9px rgba(33,78,64,.2) !important; scroll-margin: 30vh !important; }`;
  (document.head || document.documentElement).append(pageStyle);

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.kayaOwned = 'true';
  Object.assign(host.style, { position: 'fixed', zIndex: '2147483647', right: '18px', bottom: '18px', width: 'min(360px, calc(100vw - 36px))' });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    .card { font: 14px/1.45 system-ui, sans-serif; color: #183e35; background: #f7f8f2; border: 2px solid #214e40; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; color: white; background: #214e40; }
    header strong { font-size: 15px; } button { font: inherit; cursor: pointer; }
    .exit { border: 1px solid #ffffff88; border-radius: 7px; padding: 4px 8px; color: white; background: transparent; }
    .body { padding: 14px; } .summary { margin: 0 0 12px; color: #526359; }
    .count { margin: 0 0 5px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h2 { margin: 0 0 6px; font-size: 18px; line-height: 1.25; } .help { margin: 0; }
    .original { margin: 5px 0 0; font-size: 12px; color: #526359; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
    .actions button { min-height: 40px; border: 1px solid #b8c8ba; border-radius: 8px; color: #214e40; background: white; }
    .actions .focus { grid-column: 1 / -1; color: white; border-color: #214e40; background: #214e40; }
    button:disabled { cursor: default; opacity: .45; } button:focus-visible { outline: 3px solid #d68a32; outline-offset: 2px; }
  `;
  const card = document.createElement('section');
  card.className = 'card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Kaya guided form view');
  const header = document.createElement('header');
  const title = document.createElement('strong'); title.textContent = 'Kaya guided view';
  const exit = document.createElement('button'); exit.className = 'exit'; exit.type = 'button'; exit.textContent = 'Exit';
  header.append(title, exit);
  const body = document.createElement('div'); body.className = 'body';
  const summary = document.createElement('p'); summary.className = 'summary'; summary.textContent = plan.overview || 'Work through the original fields one step at a time.';
  const count = document.createElement('p'); count.className = 'count';
  const heading = document.createElement('h2');
  const help = document.createElement('p'); help.className = 'help';
  const original = document.createElement('p'); original.className = 'original';
  const actions = document.createElement('div'); actions.className = 'actions';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = 'Previous';
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next';
  const focus = document.createElement('button'); focus.type = 'button'; focus.className = 'focus'; focus.textContent = 'Go to original field';
  actions.append(previous, next, focus); body.append(summary, count, heading, help, original, actions); card.append(header, body); shadow.append(style, card);
  document.documentElement.append(host);

  let current = 0;
  const show = (index, shouldFocus = false) => {
    fields.forEach((field) => field.removeAttribute(ACTIVE));
    current = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[current];
    const field = fields[step.fieldIndex];
    const metadata = plan.fieldMetadata?.[step.fieldIndex];
    field.setAttribute(ACTIVE, '');
    count.textContent = `Field ${current + 1} of ${steps.length}`;
    heading.textContent = metadata?.label || metadata?.placeholder || step.plainLabel;
    help.textContent = step.helpText;
    const originalLabel = metadata?.label || metadata?.placeholder || metadata?.type || 'Unlabeled field';
    original.textContent = `Original field: ${originalLabel} · ${metadata?.required ? 'Required' : 'Optional or not marked required'}`;
    previous.disabled = current === 0;
    next.disabled = current === steps.length - 1;
    field.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (shouldFocus) field.focus({ preventScroll: true });
  };
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  focus.addEventListener('click', () => show(current, true));
  exit.addEventListener('click', cleanExisting);
  show(0);
  return { appliedCount: steps.length };
}
