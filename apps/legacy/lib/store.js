import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ulid, isUlid, shareToken } from './ids.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
const now = () => new Date().toISOString();

// Single-process app: one write queue keeps concurrent requests from
// clobbering each other's read-modify-write cycles.
let chain = Promise.resolve();
export function withLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

// token -> projectId, kept in memory so client views are a single file read.
const shareIndex = new Map();

const fileFor = (id) => path.join(PROJECTS_DIR, `${id}.json`);

export async function init() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  shareIndex.clear();
  for (const project of await readAll()) {
    for (const link of project.shareLinks || []) shareIndex.set(link.token, project.id);
  }
}

async function readAll() {
  const entries = await fs.readdir(PROJECTS_DIR).catch(() => []);
  const out = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const project = await read(name.slice(0, -5)).catch(() => null);
    if (project) out.push(project);
  }
  return out;
}

export async function read(id) {
  if (!isUlid(id)) return null;
  const raw = await fs.readFile(fileFor(id), 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return null;
    throw err;
  });
  return raw === null ? null : JSON.parse(raw);
}

async function write(project) {
  project.updatedAt = now();
  const target = fileFor(project.id);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2));
  await fs.rename(tmp, target);
  return project;
}

export async function list() {
  const projects = await readAll();
  projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return projects;
}

export function newTab(name, position) {
  return {
    id: ulid(),
    name,
    position,
    document: emptyDoc(),
    createdAt: now(),
    updatedAt: now(),
  };
}

export async function create(name) {
  const stamp = now();
  const project = {
    id: ulid(),
    name,
    createdAt: stamp,
    updatedAt: stamp,
    tabs: [newTab('General', 0)],
    shareLinks: [],
  };
  return write(project);
}

export async function save(project) {
  return write(project);
}

export async function remove(id) {
  const project = await read(id);
  if (!project) return false;
  for (const link of project.shareLinks || []) shareIndex.delete(link.token);
  await fs.unlink(fileFor(id)).catch(() => {});
  return true;
}

export function reindexShares(project) {
  for (const [token, pid] of shareIndex) if (pid === project.id) shareIndex.delete(token);
  for (const link of project.shareLinks || []) shareIndex.set(link.token, project.id);
}

export async function readByToken(token) {
  const id = shareIndex.get(token);
  if (!id) return null;
  const project = await read(id);
  if (!project || !(project.shareLinks || []).some((l) => l.token === token)) return null;
  return project;
}

export const PERMISSIONS = ['read', 'write'];

/** Older links stored a `label` and no permission; treat those as read & write. */
export function normalizeShareLinks(project) {
  project.shareLinks = (project.shareLinks || []).map((link) => ({
    token: link.token,
    name: link.name ?? link.label ?? '',
    permission: PERMISSIONS.includes(link.permission) ? link.permission : 'write',
    createdAt: link.createdAt || now(),
  }));
  return project;
}

export function addShareLink(project, { name = '', permission = 'read' } = {}) {
  const link = {
    token: shareToken(),
    name,
    permission: PERMISSIONS.includes(permission) ? permission : 'read',
    createdAt: now(),
  };
  normalizeShareLinks(project);
  project.shareLinks.push(link);
  shareIndex.set(link.token, project.id);
  return link;
}

export function updateShareLink(project, token, { name, permission }) {
  normalizeShareLinks(project);
  const link = project.shareLinks.find((l) => l.token === token);
  if (!link) return null;
  if (name !== undefined) link.name = name;
  if (permission !== undefined && PERMISSIONS.includes(permission)) link.permission = permission;
  return link;
}

export const findShareLink = (project, token) =>
  (project.shareLinks || []).find((l) => l.token === token) || null;

export function removeShareLink(project, token) {
  const before = (project.shareLinks || []).length;
  project.shareLinks = (project.shareLinks || []).filter((l) => l.token !== token);
  shareIndex.delete(token);
  return project.shareLinks.length !== before;
}

/** Keep positions as a dense 0..n-1 range in array order. */
export function normalize(project) {
  project.tabs.sort((a, b) => a.position - b.position);
  project.tabs.forEach((tab, i) => { tab.position = i; });
  return project;
}
