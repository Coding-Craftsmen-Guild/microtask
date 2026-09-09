import {
  api,
  $,
  el,
  toast,
  tabProgress,
  projectProgress,
  progressBar,
  promptDialog,
  confirmDialog,
  popupMenu,
} from './util.js';
import { createEditor, buildToolbar } from './editor.js';

const projectId = location.pathname.split('/').filter(Boolean).pop();

let project = null;
let activeTabId = null;
let editor = null;
let refreshToolbar = () => {};
let dirty = false;
let saveTimer = null;

const tabbar = $('#tabbar');
const saveState = el('span', { class: 'save-state' });

const activeTab = () => project?.tabs.find((t) => t.id === activeTabId) || null;

function setSaveState(state) {
  const text = { saving: 'Saving…', saved: 'Saved', error: 'Not saved — retrying…' }[state] || '';
  saveState.textContent = text;
  saveState.className = `save-state ${state === 'saved' ? '' : state}`;
}

// ------------------------------------------------------------------- saving

function scheduleSave() {
  dirty = true;
  setSaveState('saving');
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
    await api(`/api/projects/${projectId}/tabs/${tab.id}/document`, {
      method: 'PUT',
      body: { document: doc },
      keepalive,
    });
    if (!dirty) setSaveState('saved');
  } catch (err) {
    dirty = true;
    setSaveState('error');
    toast(err.message, 'error');
    saveTimer = setTimeout(() => void flush(), 4000);
  }
}

// ---------------------------------------------------------------- rendering

function renderHeader() {
  if (document.activeElement !== $('#title')) $('#title').textContent = project.name;
  document.title = `${project.name} · CC Guild Microtask`;
  const overall = projectProgress(project);
  const pct = overall.total ? Math.round((overall.done / overall.total) * 100) : 0;
  $('#overall').replaceChildren(
    el(
      'span',
      { class: 'progress' },
      el('span', {}, overall.total ? `Overall progress: ${pct}%` : 'No tasks yet'),
      progressBar(overall, { label: false }),
    ),
  );
}

function renderTabProgress() {
  const tab = activeTab();
  if (!tab) return;
  const { done, total } = tabProgress(tab);
  $('#tab-progress').replaceChildren(
    el('strong', { style: 'color:var(--ink);font-weight:600' }, tab.name),
    el('span', {}, total ? `${done} / ${total} completed` : 'No checklist items in this tab'),
    progressBar({ done, total }, { label: false }),
  );
}

const tabButtons = new Map();

/** Keystrokes only ever change the count badges — patch those in place. */
function updateTabCounts() {
  for (const tab of project.tabs) {
    const button = tabButtons.get(tab.id);
    if (!button) continue;
    const { done, total } = tabProgress(tab);
    let badge = button.querySelector('.count');
    if (!total) {
      badge?.remove();
      continue;
    }
    if (!badge) {
      badge = el('span', { class: 'count' });
      const caret = button.querySelector('.caret');
      if (caret) caret.before(badge);
      else button.append(badge);
    }
    badge.textContent = `${done}/${total}`;
  }
}

function renderTabs() {
  tabbar.replaceChildren();
  tabButtons.clear();
  project.tabs.forEach((tab, index) => {
    const isActive = tab.id === activeTabId;
    const { done, total } = tabProgress(tab);
    const button = el(
      'button',
      {
        class: `tab${isActive ? ' active' : ''}`,
        type: 'button',
        title: isActive ? 'Tab options' : `Open ${tab.name}`,
        onClick: () => (isActive ? openTabMenu(button, tab, index) : selectTab(tab.id)),
        onContextmenu: (e) => {
          e.preventDefault();
          openTabMenu(button, tab, index);
        },
      },
      el('span', {}, tab.name),
      total ? el('span', { class: 'count' }, `${done}/${total}`) : null,
      isActive ? el('span', { class: 'caret' }, '▾') : null,
    );
    tabbar.append(button);
    tabButtons.set(tab.id, button);
  });

  tabbar.append(
    el('button', { class: 'tab-add', type: 'button', title: 'New tab', onClick: createTab }, '+'),
  );
  tabbar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ----------------------------------------------------------- tab operations

async function selectTab(tabId, { push = true } = {}) {
  await flush();
  const tab = project.tabs.find((t) => t.id === tabId) || project.tabs[0];
  activeTabId = tab.id;
  editor.commands.setContent(tab.document, false);
  if (push) history.replaceState(null, '', `/admin/projects/${projectId}?tab=${tab.id}`);
  renderTabs();
  renderTabProgress();
  refreshToolbar();
  setSaveState('');
}

async function createTab() {
  const name = await promptDialog({
    title: 'New tab',
    label: 'Tab name',
    placeholder: 'Client tasks',
    submitLabel: 'Create',
  });
  if (!name) return;
  const { project: updated, tab } = await api(`/api/projects/${projectId}/tabs`, {
    method: 'POST',
    body: { name },
  });
  project = updated;
  await selectTab(tab.id);
  renderHeader();
}

function openTabMenu(anchor, tab, index) {
  popupMenu(anchor, [
    {
      label: 'Rename',
      onSelect: async () => {
        const name = await promptDialog({
          title: 'Rename tab',
          label: 'Tab name',
          value: tab.name,
          submitLabel: 'Rename',
        });
        if (!name || name === tab.name) return;
        project = await api(`/api/projects/${projectId}/tabs/${tab.id}`, {
          method: 'PATCH',
          body: { name },
        });
        renderTabs();
        renderTabProgress();
      },
    },
    {
      label: 'Move left',
      disabled: index === 0,
      onSelect: () => moveTab(tab.id, 'left'),
    },
    {
      label: 'Move right',
      disabled: index === project.tabs.length - 1,
      onSelect: () => moveTab(tab.id, 'right'),
    },
    '-',
    {
      label: 'Delete tab',
      danger: true,
      disabled: project.tabs.length <= 1,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: `Delete “${tab.name}”?`,
          message: 'Everything written in this tab is deleted. This cannot be undone.',
          confirmLabel: 'Delete tab',
          danger: true,
        });
        if (!ok) return;
        dirty = false;
        project = await api(`/api/projects/${projectId}/tabs/${tab.id}`, { method: 'DELETE' });
        await selectTab(project.tabs[Math.max(0, index - 1)].id);
        renderHeader();
        toast('Tab deleted');
      },
    },
  ]);
}

async function moveTab(tabId, direction) {
  project = await api(`/api/projects/${projectId}/tabs/${tabId}/move`, {
    method: 'POST',
    body: { direction },
  });
  renderTabs();
}

// ------------------------------------------------------------------- share

const shareDialog = $('#share-dialog');

const PERMISSION_LABEL = { read: 'Read only', write: 'Read & write' };

async function copyLink(url, input) {
  input.select();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    document.execCommand('copy');
  }
  toast('Link copied');
}

async function patchLink(token, body) {
  project = await api(`/api/projects/${projectId}/share/${token}`, { method: 'PATCH', body });
  renderShareLinks();
}

function linkRow(link) {
  const url = `${location.origin}/share/${link.token}`;
  const input = el('input', { type: 'text', readonly: 'readonly', value: url });

  const menuButton = el(
    'button',
    {
      class: 'btn btn-sm',
      type: 'button',
      title: 'Link options',
      onClick: () =>
        popupMenu(menuButton, [
          {
            label: 'Rename',
            onSelect: async () => {
              const name = await promptDialog({
                title: 'Name this link',
                label: 'Who is it for?',
                value: link.name || '',
                placeholder: 'Jane at ACME',
                submitLabel: 'Save',
                allowEmpty: true,
              });
              if (name === null) return;
              await patchLink(link.token, { name });
            },
          },
          {
            label: 'Set to read only',
            disabled: link.permission === 'read',
            onSelect: () => patchLink(link.token, { permission: 'read' }),
          },
          {
            label: 'Set to read & write',
            disabled: link.permission === 'write',
            onSelect: () => patchLink(link.token, { permission: 'write' }),
          },
          '-',
          {
            label: 'Revoke link',
            danger: true,
            onSelect: async () => {
              const ok = await confirmDialog({
                title: `Revoke ${link.name ? `“${link.name}”` : 'this link'}?`,
                message: 'Anyone using it loses access immediately. This cannot be undone.',
                confirmLabel: 'Revoke',
                danger: true,
              });
              if (!ok) return;
              project = await api(`/api/projects/${projectId}/share/${link.token}`, {
                method: 'DELETE',
              });
              renderShareLinks();
              toast('Link revoked');
            },
          },
        ]),
    },
    '⋯',
  );

  return el(
    'div',
    { class: 'link-row' },
    el(
      'div',
      { class: 'link-head' },
      el('span', { class: 'link-name' }, link.name || 'Unnamed link'),
      el('span', { class: `access-badge ${link.permission}` }, PERMISSION_LABEL[link.permission]),
    ),
    el(
      'div',
      { class: 'link-actions' },
      input,
      el('button', { class: 'btn btn-sm', type: 'button', onClick: () => copyLink(url, input) }, 'Copy'),
      menuButton,
    ),
  );
}

function renderShareLinks() {
  const links = project.shareLinks || [];
  $('#share-links').replaceChildren(
    ...(links.length
      ? links.map(linkRow)
      : [el('p', { class: 'hint empty-links' }, 'No links yet — add one above.')]),
  );
}

$('#share-btn').addEventListener('click', () => {
  renderShareLinks();
  shareDialog.showModal();
});
$('#share-close').addEventListener('click', () => shareDialog.close());
$('#share-new').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    const { project: updated } = await api(`/api/projects/${projectId}/share`, {
      method: 'POST',
      body: {
        name: form.elements.name.value.trim(),
        permission: form.elements.permission.value,
      },
    });
    project = updated;
    form.elements.name.value = '';
    renderShareLinks();
    toast('Link created');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ------------------------------------------------------------ project title

const title = $('#title');
title.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    title.blur();
  }
  if (e.key === 'Escape') {
    title.textContent = project.name;
    title.blur();
  }
});
title.addEventListener('blur', async () => {
  const name = title.textContent.replace(/\s+/g, ' ').trim();
  if (!name || name === project.name) {
    title.textContent = project.name;
    return;
  }
  project = await api(`/api/projects/${projectId}`, { method: 'PATCH', body: { name } });
  renderHeader();
  toast('Project renamed');
});

// ------------------------------------------------------------------- boot

async function boot() {
  project = await api(`/api/projects/${projectId}`);
  const wanted = new URLSearchParams(location.search).get('tab');
  activeTabId = project.tabs.some((t) => t.id === wanted) ? wanted : project.tabs[0].id;

  editor = createEditor({
    element: $('#doc'),
    document: activeTab().document,
    onUpdate: (instance) => {
      const tab = activeTab();
      if (!tab) return;
      tab.document = instance.getJSON();
      scheduleSave();
      renderTabProgress();
      updateTabCounts();
      renderHeader();
    },
    onSelection: () => refreshToolbar(),
  });

  const toolbar = $('#toolbar');
  refreshToolbar = buildToolbar(toolbar, editor, { onLink: setLink });
  toolbar.append(el('span', { class: 'grow' }), saveState);

  renderHeader();
  renderTabs();
  renderTabProgress();
  refreshToolbar();
  history.replaceState(null, '', `/admin/projects/${projectId}?tab=${activeTabId}`);
}

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

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  void flush({ keepalive: true });
  e.preventDefault();
  e.returnValue = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush({ keepalive: true });
});
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void flush();
  }
});

boot().catch((err) => {
  toast(err.message, 'error');
  $('#doc').replaceChildren(el('div', { class: 'empty' }, err.message));
});
