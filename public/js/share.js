import { api, $, el, toast, tabProgress, projectProgress, progressBar, promptDialog } from './util.js';
import { createEditor, buildToolbar } from './editor.js';

const token = location.pathname.split('/').filter(Boolean).pop();

let data = null;
let activeTabId = null;
let editor = null;
let refreshToolbar = () => {};
let canWrite = false;
let dirty = false;
let saveTimer = null;

const status = $('#status');
const activeTab = () => data?.tabs.find((t) => t.id === activeTabId) || null;

// ------------------------------------------------------------------- saving

function setStatus(state) {
  status.textContent =
    { saving: 'Saving…', saved: 'Saved', error: 'Not saved — retrying…' }[state] || '';
  status.className = `appbar-link ${state === 'error' ? 'error' : ''}`;
}

function scheduleSave() {
  dirty = true;
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), 700);
}

async function flush({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  const tab = activeTab();
  if (!dirty || !tab) return;
  const doc = tab.document;
  dirty = false;
  try {
    await api(`/api/share/${token}/tabs/${tab.id}/document`, {
      method: 'PUT',
      body: { document: doc },
      keepalive,
    });
    if (!dirty) setStatus('saved');
  } catch (err) {
    dirty = true;
    setStatus('error');
    toast(err.message, 'error');
    saveTimer = setTimeout(() => void flush(), 4000);
  }
}

// ---------------------------------------------------------------- rendering

function renderHeader() {
  $('#title').textContent = data.name;
  document.title = `${data.name} · CC Guild Microtask`;
  const overall = projectProgress(data);
  $('#overall').replaceChildren(
    el(
      'span',
      { class: 'progress' },
      el(
        'span',
        {},
        overall.total
          ? `Overall progress: ${Math.round((overall.done / overall.total) * 100)}%`
          : 'A shared project workspace',
      ),
      overall.total ? progressBar(overall, { label: false }) : null,
    ),
    el(
      'span',
      { class: `access-badge ${canWrite ? 'write' : 'read'}` },
      canWrite ? 'You can edit' : 'View only',
    ),
    data.viewer ? el('span', { class: 'viewer-name' }, `Signed in as ${data.viewer}`) : null,
  );
}

function renderTabProgress() {
  const tab = activeTab();
  const { done, total } = tabProgress(tab);
  $('#tab-progress').replaceChildren(
    el('strong', { style: 'color:var(--ink);font-weight:600' }, tab.name),
    total
      ? el('span', {}, `${done} / ${total} completed`)
      : el('span', {}, canWrite ? 'No checklist items yet' : 'Nothing to tick here'),
    total ? progressBar({ done, total }, { label: false }) : null,
  );
}

function renderTabs() {
  $('#tabbar').replaceChildren(
    ...data.tabs.map((tab) => {
      const { done, total } = tabProgress(tab);
      return el(
        'button',
        {
          class: `tab${tab.id === activeTabId ? ' active' : ''}`,
          type: 'button',
          onClick: () => selectTab(tab.id),
        },
        el('span', {}, tab.name),
        total ? el('span', { class: 'count' }, `${done}/${total}`) : null,
      );
    }),
  );
}

async function selectTab(tabId) {
  await flush();
  activeTabId = tabId;
  editor.commands.setContent(activeTab().document, false);
  history.replaceState(null, '', `/share/${token}?tab=${tabId}`);
  renderTabs();
  renderTabProgress();
  refreshToolbar();
  setStatus('');
}

// ------------------------------------------------------------------- boot

async function setLink() {
  const current = editor.getAttributes('link').href || '';
  const href = await promptDialog({
    title: current ? 'Edit link' : 'Add link',
    hint: 'Leave empty to remove the link.',
    value: current,
    placeholder: 'https://example.com',
    submitLabel: 'Apply',
    allowEmpty: true,
  });
  if (href === null) return;
  const chain = editor.chain().focus().extendMarkRange('link');
  if (!href) chain.unsetLink().run();
  else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}` }).run();
}

async function boot() {
  data = await api(`/api/share/${token}`);
  canWrite = data.permission === 'write';
  const wanted = new URLSearchParams(location.search).get('tab');
  activeTabId = data.tabs.some((t) => t.id === wanted) ? wanted : data.tabs[0].id;

  editor = createEditor({
    element: $('#doc'),
    document: activeTab().document,
    editable: canWrite,
    onUpdate: canWrite
      ? (instance) => {
          const tab = activeTab();
          if (!tab) return;
          tab.document = instance.getJSON();
          scheduleSave();
          renderTabProgress();
          renderTabs();
          renderHeader();
        }
      : undefined,
    onSelection: canWrite ? () => refreshToolbar() : undefined,
  });

  if (canWrite) refreshToolbar = buildToolbar($('#toolbar'), editor, { onLink: setLink });
  else $('#shell').classList.add('is-readonly');

  renderHeader();
  renderTabs();
  renderTabProgress();
  refreshToolbar();
  history.replaceState(null, '', `/share/${token}?tab=${activeTabId}`);
}

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  void flush({ keepalive: true });
  e.preventDefault();
  e.returnValue = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush({ keepalive: true });
});

boot().catch((err) => {
  $('#title').textContent = 'Link unavailable';
  $('#overall').textContent = err.message;
});
