import { countTasks } from './docdiff.js';

export async function api(path, { method = 'GET', body, keepalive } = {}) {
  const res = await fetch(path, {
    method,
    keepalive,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith('/api/login')) {
    location.href = '/login';
    throw new Error('Login required');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Append children, skipping the nullish ones so `cond ? node : null` works. */
function appendAll(node, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  return appendAll(node, children);
}

/** Replace a node's contents under el()'s nullish rule. Native replaceChildren()
 *  renders a null child as the literal text "null". */
export function fill(node, ...children) {
  node.replaceChildren();
  return appendAll(node, children);
}

let toastTimer;
export function toast(message, kind = '') {
  let node = $('.toast');
  if (!node) {
    node = el('div', { class: 'toast' });
    document.body.append(node);
  }
  node.textContent = message;
  node.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Task totals for one tab, and for a whole project. Never stored — always derived. */
export const tabProgress = (tab) => countTasks(tab.document);

export function projectProgress(project) {
  return (project.tabs || []).reduce(
    (acc, tab) => {
      const { done, total } = countTasks(tab.document);
      return { done: acc.done + done, total: acc.total + total };
    },
    { done: 0, total: 0 },
  );
}

export function progressBar({ done, total }, { label = true } = {}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = el('div', { class: `bar${total && done === total ? ' done' : ''}` }, el('i'));
  requestAnimationFrame(() => {
    bar.firstChild.style.width = `${pct}%`;
  });
  const node = el('div', { class: 'progress' }, bar);
  if (label) node.append(el('span', {}, total ? `${done} / ${total} · ${pct}%` : 'No tasks yet'));
  return node;
}

// ------------------------------------------------------------------ dialogs

function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = el('dialog');
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      dialog.close();
      dialog.remove();
    };
    dialog.append(build(close));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    document.body.append(dialog);
    dialog.showModal();
    const focusTarget = $('input, button.btn-primary', dialog);
    focusTarget?.focus();
    focusTarget?.select?.();
  });
}

export function promptDialog({
  title,
  hint,
  label,
  value = '',
  placeholder = '',
  submitLabel = 'Save',
  allowEmpty = false,
}) {
  return openDialog((close) => {
    const input = el('input', { type: 'text', value, placeholder, maxlength: '200' });
    const form = el(
      'form',
      {
        class: 'body',
        onSubmit: (e) => {
          e.preventDefault();
          const next = input.value.trim();
          if (next || allowEmpty) close(next);
        },
      },
      el('h2', {}, title),
      hint ? el('p', { class: 'hint' }, hint) : null,
      label ? el('p', { class: 'hint', style: 'margin-bottom:6px' }, label) : null,
      input,
      el(
        'div',
        { class: 'actions' },
        el('button', { type: 'button', class: 'btn', onClick: () => close(null) }, 'Cancel'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel),
      ),
    );
    return form;
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return openDialog((close) =>
    el(
      'div',
      { class: 'body' },
      el('h2', {}, title),
      el('p', { class: 'hint' }, message),
      el(
        'div',
        { class: 'actions' },
        el('button', { type: 'button', class: 'btn', onClick: () => close(false) }, 'Cancel'),
        el(
          'button',
          {
            type: 'button',
            class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
            onClick: () => close(true),
          },
          confirmLabel,
        ),
      ),
    ),
  );
}

/** Small popup menu anchored under an element. */
export function popupMenu(anchor, items) {
  $('.menu')?.remove();
  const menu = el('div', { class: 'menu' });
  for (const item of items) {
    if (item === '-') {
      menu.append(el('hr'));
      continue;
    }
    menu.append(
      el(
        'button',
        {
          type: 'button',
          class: item.danger ? 'danger' : '',
          disabled: item.disabled || null,
          onClick: () => {
            menu.remove();
            item.onSelect();
          },
        },
        item.label,
      ),
    );
  }
  // A modal <dialog> renders in the top layer, so a menu appended to <body>
  // would paint behind it and get dimmed by its backdrop.
  const host = anchor.closest('dialog[open]') || document.body;
  host.append(menu);

  // Stay inside the host (the dialog box, otherwise the viewport), and never
  // outside the viewport.
  const box = host === document.body ? null : host.getBoundingClientRect();
  const pad = 8;
  const bounds = {
    left: Math.max(pad, box ? box.left + pad : pad),
    right: Math.min(window.innerWidth - pad, box ? box.right - pad : window.innerWidth - pad),
    top: Math.max(pad, box ? box.top + pad : pad),
    bottom: Math.min(window.innerHeight - pad, box ? box.bottom - pad : window.innerHeight - pad),
  };
  const rect = anchor.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = menu;

  // Left-aligned to the anchor, flipping to right-aligned when that overflows.
  let left = rect.left;
  if (left + width > bounds.right) left = rect.right - width;
  left = Math.max(bounds.left, Math.min(left, bounds.right - width));

  // Below the anchor, flipping above when there is no room.
  let top = rect.bottom + 4;
  if (top + height > bounds.bottom) top = rect.top - height - 4;
  top = Math.max(bounds.top, Math.min(top, bounds.bottom - height));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const dismiss = (e) => {
    if (menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('mousedown', dismiss);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') dismiss({ target: document.body });
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', onKey);
  });
  return menu;
}
