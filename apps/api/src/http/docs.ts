import { createHash } from 'node:crypto'
import type { OpenAPIHono } from '@hono/zod-openapi'

/** Where the generated OpenAPI document is served. */
export const DOC_PATH = '/openapi.json'

/** Where the human-readable reference is served. */
export const DOCS_PATH = '/docs'

/** What `getOpenAPI31Document` is generated from, named without importing the generator. */
export type DocConfig = Parameters<OpenAPIHono['getOpenAPI31Document']>[0]

/**
 * The head of the emitted document.
 *
 * Exported so the build script that writes `openapi.json` generates the same document this route
 * serves, rather than a second one that drifts.
 */
export const docConfig: DocConfig = {
  openapi: '3.1.0',
  info: {
    title: 'CC Guild API',
    version: '1.0.0',
    description:
      'One route tree serving two principal kinds. Every request presents a service key and a bearer token; what a request may reach is decided by the access policy, never by which credential arrived.',
  },
}

const STYLE = `
:root { color-scheme: light dark; --line: color-mix(in srgb, currentColor 15%, transparent); }
body { margin: 0 auto; padding: 2rem 1.25rem 4rem; max-width: 52rem; line-height: 1.5;
  font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
h2 { font-size: 1rem; margin: 0 0 .35rem; font-weight: 600; }
p { margin: 0 0 .35rem; }
article { border-top: 1px solid var(--line); padding: .9rem 0; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.m { border-radius: .25rem; padding: .1rem .4rem; margin-right: .5rem; font-size: .75rem;
  letter-spacing: .04em; border: 1px solid var(--line); }
.sec, .intro { opacity: .7; font-size: .85rem; }
`

const SCRIPT = `
const main = document.getElementById('ops')
const show = (id, text) => { document.getElementById(id).textContent = text }
const operation = (path, method, op) => {
  const article = document.createElement('article')
  const heading = document.createElement('h2')
  const badge = document.createElement('code')
  badge.className = 'm'
  badge.textContent = method.toUpperCase()
  const where = document.createElement('code')
  where.textContent = path
  heading.append(badge, where)
  const summary = document.createElement('p')
  summary.textContent = op.summary || op.description || ''
  const security = document.createElement('p')
  security.className = 'sec'
  const names = (op.security || []).flatMap((one) => Object.keys(one))
  security.textContent = names.length ? 'Credentials: ' + names.join(' + ') : 'No credentials declared'
  article.append(heading, summary, security)
  return article
}
const response = await fetch('${DOC_PATH}', { headers: { accept: 'application/json' } })
if (!response.ok) {
  show('ops', 'The document could not be generated (HTTP ' + response.status + ').')
} else {
  const doc = await response.json()
  show('title', doc.info.title + ' v' + doc.info.version)
  show('intro', doc.info.description || '')
  document.title = doc.info.title
  const rows = Object.entries(doc.paths || {}).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => operation(path, method, op)))
  main.replaceChildren(...rows)
}
`

const hash = (value: string): string =>
  `'sha256-${createHash('sha256').update(value, 'utf8').digest('base64')}'`

const POLICY = [
  `default-src 'none'`,
  `connect-src 'self'`,
  `script-src ${hash(SCRIPT)}`,
  `style-src ${hash(STYLE)}`,
  `base-uri 'none'`,
  `form-action 'none'`,
  `frame-ancestors 'none'`,
].join('; ')

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>API reference</title>
<style>${STYLE}</style>
</head>
<body>
<h1 id="title">API reference</h1>
<p class="intro" id="intro"></p>
<main id="ops">Loading ${DOC_PATH}…</main>
<script type="module">${SCRIPT}</script>
</body>
</html>
`

/**
 * Serves a reference page built from this API's own document and nothing else.
 *
 * **The offline decision.** `@hono/swagger-ui` declares no dependencies because it does not ship
 * Swagger UI — it emits `<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist/...">`, with
 * no version pin and no subresource integrity. That is a live third-party origin executing
 * script on a page an admin opens on the same origin as the API, on a deployment whose whole
 * posture is that the API is internal. Self-hosting the real thing means `swagger-ui-dist`,
 * which depends on `@scarf/scarf` for a `postinstall` telemetry call and would need an entry in
 * this workspace's `allowBuilds`, plus megabytes of assets served from disk.
 *
 * So neither is installed. This page is a few hundred bytes of markup that fetches
 * `{@link DOC_PATH}` from the same origin and lists the operations. It is less than Swagger UI
 * and it is honest about what it is: the machine-readable document is the real artefact, and
 * a reader who wants "try it out" can point any local client at that.
 *
 * The content security policy is what makes "offline" a property rather than an intention:
 * `default-src 'none'` with `connect-src 'self'` means the browser refuses every origin but this
 * one, and the inline script is admitted by its own SHA-256 rather than by `'unsafe-inline'`, so
 * an injected script would not run either. Nothing here can regress into a CDN reference without
 * the policy stopping it first.
 */
export function docsHandler(): Response {
  return new Response(PAGE, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': POLICY,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  })
}
