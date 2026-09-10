import { api, $, el, toast, relativeTime, projectProgress, progressBar, confirmDialog } from './util.js';

const list = $('#list');

function row(project) {
  const progress = projectProgress(project);
  const tabs = project.tabs || [];

  return el(
    'div',
    { class: 'card project-row' },
    el(
      'div',
      { class: 'grow' },
      el('a', { class: 'name', href: `/admin/projects/${project.id}`, style: 'text-decoration:none;color:inherit' }, project.name),
      el(
        'div',
        { class: 'meta' },
        `${tabs.length} tab${tabs.length === 1 ? '' : 's'}`,
        project.shareCount ? ` · ${project.shareCount} share link${project.shareCount === 1 ? '' : 's'}` : '',
        ` · updated ${relativeTime(project.updatedAt)}`,
      ),
      el('div', { class: 'tab-chips' }, tabs.slice(0, 8).map((t) => el('span', { class: 'chip' }, t.name))),
    ),
    progressBar(progress),
    el('a', { class: 'btn btn-sm', href: `/admin/projects/${project.id}` }, 'Open'),
    el(
      'button',
      {
        class: 'btn btn-sm btn-danger',
        title: 'Delete project',
        onClick: async () => {
          const ok = await confirmDialog({
            title: `Delete “${project.name}”?`,
            message: 'All of its tabs, content and share links are deleted. This cannot be undone.',
            confirmLabel: 'Delete project',
            danger: true,
          });
          if (!ok) return;
          await api(`/api/projects/${project.id}`, { method: 'DELETE' });
          toast('Project deleted');
          load();
        },
      },
      'Delete',
    ),
  );
}

async function load() {
  const projects = await api('/api/projects');
  list.replaceChildren(
    ...(projects.length
      ? projects.map(row)
      : [el('div', { class: 'card empty' }, 'No projects yet — create your first one above.')]),
  );
}

$('#new-project').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = event.target.elements.name;
  const name = input.value.trim();
  if (!name) return;
  try {
    const project = await api('/api/projects', { method: 'POST', body: { name } });
    location.href = `/admin/projects/${project.id}`;
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#logout').addEventListener('click', async (e) => {
  e.preventDefault();
  await api('/api/logout', { method: 'POST' });
  location.href = '/login';
});

load().catch((err) => toast(err.message, 'error'));
