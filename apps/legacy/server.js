import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from './lib/store.js';
import { isUlid, isToken } from './lib/ids.js';
import { isValidDoc } from './public/js/docdiff.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4321);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE = 'ccg_admin';

if (!ADMIN_PASSWORD) {
  console.error(
    '\n  ADMIN_PASSWORD is required — refusing to start without it.\n' +
      '  Local:   ADMIN_PASSWORD=your-password npm start\n' +
      '  Docker:  set it in .env next to docker-compose.yml\n' +
      "  Coolify: add it under the resource's Environment Variables\n",
  );
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.warn('  Warning: ADMIN_PASSWORD is shorter than 8 characters.');
}

const hashPassword = (value) => crypto.createHash('sha256').update(`ccg:${value}`).digest('hex');
const sessionValue = hashPassword(ADMIN_PASSWORD);

/** Both sides are 64 hex chars, so lengths always match. */
const sameSecret = (a, b) => crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Behind Coolify's proxy TLS is terminated upstream, so trust the header. */
const isHttps = (req) =>
  Boolean(req.socket.encrypted) ||
  (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

const sessionCookie = (req, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    isHttps(req) ? '; Secure' : ''
  }`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => {
  throw new HttpError(400, msg);
};
const notFound = (msg = 'Not found') => {
  throw new HttpError(404, msg);
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function sendFile(res, filePath, { noCache = false } = {}) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) return notFound();
  const ext = path.extname(filePath);
  // Code is revalidated every load so a rebuild is never served stale;
  // images can sit in the browser cache.
  const code = ext === '.js' || ext === '.css' || ext === '.html';
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': noCache || code ? 'no-cache' : 'public, max-age=86400',
  });
  createReadStream(filePath).pipe(res);
}

const page = (res, name) => sendFile(res, path.join(PUBLIC, name), { noCache: true });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4000000) throw new HttpError(413, 'Payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return bad('Invalid JSON body');
  }
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

function isAuthed(req) {
  const got = cookies(req)[COOKIE] || '';
  return got.length === sessionValue.length && sameSecret(got, sessionValue);
}

const requireAdmin = (req) => {
  if (!isAuthed(req)) throw new HttpError(401, 'Admin login required');
};

function cleanName(value, fallback) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return fallback !== undefined ? fallback : bad('Name is required');
  return name.slice(0, 80);
}

/** Everything a client is allowed to see through a share link. */
const clientView = (project, link) => ({
  name: project.name,
  updatedAt: project.updatedAt,
  viewer: link.name,
  permission: link.permission,
  tabs: store.normalize(project).tabs.map((t) => ({
    id: t.id,
    name: t.name,
    position: t.position,
    document: t.document,
  })),
});

async function loadProject(id) {
  const project = await store.read(id);
  if (!project) notFound('Project not found');
  return store.normalizeShareLinks(store.normalize(project));
}

function findTab(project, tabId) {
  const tab = project.tabs.find((t) => t.id === tabId);
  if (!tab) notFound('Tab not found');
  return tab;
}

// ---------------------------------------------------------------- API routes

async function handleApi(req, res, segments) {
  const rest = segments.slice(1); // drop "api"
  const method = req.method;
  const at = (i) => rest[i];

  if (at(0) === 'login' && method === 'POST') {
    const { password } = await readBody(req);
    if (!sameSecret(hashPassword(String(password ?? '')), sessionValue)) {
      throw new HttpError(401, 'Wrong password');
    }
    res.setHeader('set-cookie', sessionCookie(req, sessionValue, 2592000));
    return sendJson(res, 200, { ok: true });
  }

  if (at(0) === 'logout' && method === 'POST') {
    res.setHeader('set-cookie', sessionCookie(req, '', 0));
    return sendJson(res, 200, { ok: true });
  }

  // ------- client share API: the token is the credential, no admin session
  if (at(0) === 'share') {
    const token = at(1);
    if (!isToken(token)) notFound();
    const project = await store.readByToken(token);
    if (!project) notFound('This share link is no longer available');
    const link = store.findShareLink(store.normalizeShareLinks(project), token);

    if (rest.length === 2 && method === 'GET') return sendJson(res, 200, clientView(project, link));

    // Everything below mutates, so a read-only link stops here. The check is
    // repeated inside each lock against the freshly-read link, because a link
    // can be downgraded between the read above and the write below.
    const requireWrite = (link) => {
      if (link?.permission !== 'write') throw new HttpError(403, 'This link is read-only');
    };

    // POST /api/share/:token/tabs -- create a tab (read & write links only)
    if (at(2) === 'tabs' && rest.length === 3 && method === 'POST') {
      const body = await readBody(req);
      const name = cleanName(body.name);
      return store.withLock(async () => {
        const fresh = await store.readByToken(token);
        if (!fresh) notFound('This share link is no longer available');
        requireWrite(store.findShareLink(store.normalizeShareLinks(fresh), token));
        store.normalize(fresh);
        if (fresh.tabs.length >= 40) bad('Too many tabs');
        const tab = store.newTab(name, fresh.tabs.length);
        fresh.tabs.push(tab);
        await store.save(store.normalize(fresh));
        return sendJson(res, 201, {
          tab,
          project: clientView(fresh, store.findShareLink(fresh, token)),
        });
      });
    }

    // PATCH /api/share/:token/tabs/:tabId -- rename a tab (read & write links only)
    if (at(2) === 'tabs' && rest.length === 4 && method === 'PATCH') {
      const body = await readBody(req);
      const name = body.name === undefined ? undefined : cleanName(body.name);
      return store.withLock(async () => {
        const fresh = await store.readByToken(token);
        if (!fresh) notFound('This share link is no longer available');
        requireWrite(store.findShareLink(store.normalizeShareLinks(fresh), token));
        const tab = findTab(store.normalize(fresh), at(3));
        if (name !== undefined) tab.name = name;
        tab.updatedAt = new Date().toISOString();
        await store.save(fresh);
        return sendJson(res, 200, {
          tab,
          project: clientView(fresh, store.findShareLink(fresh, token)),
        });
      });
    }

    // PUT /api/share/:token/tabs/:tabId/document -- read & write links only
    if (at(2) === 'tabs' && at(4) === 'document' && method === 'PUT') {
      const { document } = await readBody(req);
      if (!isValidDoc(document)) bad('Invalid document');
      return store.withLock(async () => {
        const fresh = await store.readByToken(token);
        if (!fresh) notFound('This share link is no longer available');
        requireWrite(store.findShareLink(store.normalizeShareLinks(fresh), token));
        // The tab has to belong to THIS token's project.
        const tab = findTab(store.normalize(fresh), at(3));
        tab.document = document;
        tab.updatedAt = new Date().toISOString();
        await store.save(fresh);
        return sendJson(res, 200, { ok: true, updatedAt: tab.updatedAt });
      });
    }
    notFound();
  }

  // ------- admin API
  requireAdmin(req);
  if (at(0) !== 'projects') notFound();

  if (rest.length === 1) {
    if (method === 'GET') {
      const projects = await store.list();
      return sendJson(
        res,
        200,
        projects.map((p) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt,
          createdAt: p.createdAt,
          shareCount: (p.shareLinks || []).length,
          tabs: store.normalize(p).tabs.map((t) => ({ id: t.id, name: t.name, document: t.document })),
        })),
      );
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const project = await store.withLock(() => store.create(cleanName(body.name)));
      return sendJson(res, 201, project);
    }
    notFound();
  }

  const projectId = at(1);
  if (!isUlid(projectId)) notFound('Project not found');

  if (rest.length === 2) {
    if (method === 'GET') return sendJson(res, 200, await loadProject(projectId));
    if (method === 'PATCH') {
      const body = await readBody(req);
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        if (body.name !== undefined) project.name = cleanName(body.name);
        await store.save(project);
        return sendJson(res, 200, project);
      });
    }
    if (method === 'DELETE') {
      return store.withLock(async () => {
        if (!(await store.remove(projectId))) notFound('Project not found');
        return sendJson(res, 200, { ok: true });
      });
    }
    notFound();
  }

  // /api/projects/:id/tabs...
  if (at(2) === 'tabs') {
    const tabId = at(3);

    if (rest.length === 3 && method === 'POST') {
      const body = await readBody(req);
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        if (project.tabs.length >= 40) bad('Too many tabs');
        const tab = store.newTab(cleanName(body.name), project.tabs.length);
        project.tabs.push(tab);
        await store.save(store.normalize(project));
        return sendJson(res, 201, { project, tab });
      });
    }

    if (!isUlid(tabId)) notFound('Tab not found');

    if (rest.length === 4 && method === 'PATCH') {
      const body = await readBody(req);
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        const tab = findTab(project, tabId);
        if (body.name !== undefined) tab.name = cleanName(body.name);
        tab.updatedAt = new Date().toISOString();
        await store.save(project);
        return sendJson(res, 200, project);
      });
    }

    if (rest.length === 4 && method === 'DELETE') {
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        findTab(project, tabId);
        if (project.tabs.length <= 1) bad('A project must keep at least one tab');
        project.tabs = project.tabs.filter((t) => t.id !== tabId);
        await store.save(store.normalize(project));
        return sendJson(res, 200, project);
      });
    }

    if (rest.length === 5 && at(4) === 'document' && method === 'PUT') {
      const { document } = await readBody(req);
      if (!isValidDoc(document)) bad('Invalid document');
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        const tab = findTab(project, tabId);
        tab.document = document;
        tab.updatedAt = new Date().toISOString();
        await store.save(project);
        return sendJson(res, 200, { ok: true, updatedAt: tab.updatedAt });
      });
    }

    if (rest.length === 5 && at(4) === 'move' && method === 'POST') {
      const { direction } = await readBody(req);
      if (direction !== 'left' && direction !== 'right') bad('direction must be left or right');
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        const i = project.tabs.findIndex((t) => t.id === tabId);
        if (i === -1) notFound('Tab not found');
        const j = direction === 'left' ? i - 1 : i + 1;
        if (j < 0 || j >= project.tabs.length) return sendJson(res, 200, project);
        [project.tabs[i], project.tabs[j]] = [project.tabs[j], project.tabs[i]];
        // Positions carry the order, so they have to move with the swap —
        // normalize() sorts by position and would otherwise undo it.
        project.tabs.forEach((tab, index) => {
          tab.position = index;
        });
        await store.save(store.normalize(project));
        return sendJson(res, 200, project);
      });
    }
    notFound();
  }

  // /api/projects/:id/share...
  if (at(2) === 'share') {
    const permissionOf = (value) => {
      if (value === undefined) return undefined;
      if (!store.PERMISSIONS.includes(value)) bad('permission must be read or write');
      return value;
    };

    if (rest.length === 3 && method === 'POST') {
      const body = await readBody(req);
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        if ((project.shareLinks || []).length >= 50) bad('Too many share links');
        const link = store.addShareLink(project, {
          name: cleanName(body.name, ''),
          permission: permissionOf(body.permission) ?? 'read',
        });
        await store.save(project);
        return sendJson(res, 201, { link, project });
      });
    }
    if (rest.length === 4 && method === 'PATCH') {
      const body = await readBody(req);
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        const link = store.updateShareLink(project, at(3), {
          name: body.name === undefined ? undefined : cleanName(body.name, ''),
          permission: permissionOf(body.permission),
        });
        if (!link) notFound('Share link not found');
        await store.save(project);
        return sendJson(res, 200, project);
      });
    }
    if (rest.length === 4 && method === 'DELETE') {
      return store.withLock(async () => {
        const project = await loadProject(projectId);
        if (!store.removeShareLink(project, at(3))) notFound('Share link not found');
        await store.save(project);
        return sendJson(res, 200, project);
      });
    }
  }
  notFound();
}

// ------------------------------------------------------------------- routing

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (segments[0] === 'api') return handleApi(req, res, segments);
  if (req.method !== 'GET' && req.method !== 'HEAD') notFound();

  // Container health probe: no auth, no data access.
  if (segments[0] === 'healthz') return sendJson(res, 200, { ok: true });

  if (segments.length === 0) return page(res, isAuthed(req) ? 'index.html' : 'login.html');
  if (segments[0] === 'login') return page(res, 'login.html');
  if (segments[0] === 'share' && segments.length === 2) return page(res, 'share.html');
  if (segments[0] === 'admin' && segments[1] === 'projects' && segments.length === 3) {
    return page(res, isAuthed(req) ? 'project.html' : 'login.html');
  }

  const filePath = path.join(PUBLIC, ...segments);
  if (!filePath.startsWith(PUBLIC + path.sep)) notFound();
  return sendFile(res, filePath);
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => route(req, res))
    .catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      const wantsJson = (req.headers.accept || '').includes('json') || req.url.startsWith('/api/');
      if (wantsJson) return sendJson(res, status, { error: err.message || 'Server error' });
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(err.message || 'Server error');
    });
});

await store.init();
server.listen(PORT, () => {
  console.log(`\n  CC GUILD Microtask  ->  http://localhost:${PORT}`);
  console.log('  admin login required · share links stay public\n');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
