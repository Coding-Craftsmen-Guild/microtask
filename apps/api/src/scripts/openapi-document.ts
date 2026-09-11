import { writeFile } from 'node:fs/promises'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createApp, docConfig } from '../app.js'
import type { ApiEnv } from '../auth/env.js'
import { buildDeps } from '../testing/harness.js'

/**
 * Where the committed document lives.
 *
 * Resolved from this module rather than from the working directory, so `pnpm openapi:emit` writes
 * the same file whether it is run from the package or from the repository root — and so the test
 * comparing the committed file against a fresh generation reads the file the script writes.
 */
export const OPENAPI_FILE = new URL('../../openapi.json', import.meta.url)

/**
 * Anything that can be asked for the document.
 *
 * Narrower than `OpenAPIHono<ApiEnv>` on purpose: it is what lets a test hand {@link documentText}
 * an app carrying a schema kind the generator cannot express, and watch the throw come back out
 * rather than having to trust that it would.
 */
export type DocumentSource = Pick<OpenAPIHono, 'getOpenAPI31Document'>

/** The app the document describes, assembled from the in-memory fixture dependencies. */
export async function documentApp(): Promise<OpenAPIHono<ApiEnv>> {
  return createApp(await buildDeps())
}

/**
 * The whole document as JSON text, or a throw.
 *
 * Generation is the part that can fail: `z.set`, `z.map`, `z.custom`, `z.file`, `z.never`,
 * `z.function`, `z.void` and `z.symbol` all throw here, and one of them reaching a route's
 * schemas would otherwise become a runtime 500 on the doc route rather than a failing build. The
 * failure is deliberately **not** caught — a stub document written in its place would pass every
 * shape check this repo has and describe an API that does not exist.
 *
 * Returning the finished text, rather than a handle or a stream or a partially written file, is
 * what makes "writes nothing when generation fails" structural instead of careful.
 */
export function documentText(app: DocumentSource): string {
  return `${JSON.stringify(app.getOpenAPI31Document(docConfig), null, 2)}\n`
}

/**
 * Writes the document to `target`, having generated all of it first.
 *
 * The generator is a parameter so this ordering can be tested with one that throws: the failure
 * has to happen before `writeFile` is reached, or a failed emit would leave a truncated or
 * error-shaped document on disk. That is the same failure as scraping the live doc route — when
 * generation throws, that route answers 500 with a body that still parses as JSON, so
 * `curl -s -o openapi.json` exits 0 and overwrites a good spec with an error object.
 */
export async function emitDocument(target: URL, generate: () => Promise<string>): Promise<void> {
  const text = await generate()
  await writeFile(target, text, 'utf8')
}

/** The document this package commits, freshly generated. */
export async function freshDocumentText(): Promise<string> {
  return documentText(await documentApp())
}
