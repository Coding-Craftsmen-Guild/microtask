import process from 'node:process'
import { OPENAPI_FILE, emitDocument, freshDocumentText } from './openapi-document.js'

/**
 * Writes `openapi.json`, or exits 1 having written nothing.
 *
 * **It imports `../app.js` and never `server.ts`.** An emit script that transitively imports a
 * module calling `serve()` at module scope wrote its file and then never exited — the listening
 * socket holds the event loop open, so the build step hangs rather than failing.
 *
 * It lives under `src/` rather than in a top-level `scripts/` directory. Every package here sets
 * `rootDir: "src"`, and a second top-level source directory makes `tsc` infer the package as the
 * common root and emit `dist/src/server.js`, which breaks both `start` and `openapi:emit` in the
 * manifest.
 *
 * The exit code is the whole point. **CI must never obtain this document by scraping the live
 * doc route:** when schema generation throws, that route answers 500 with a body that still
 * parses as JSON, so `curl -s -o openapi.json` exits 0 and overwrites a good document with an
 * error object. Here a failure writes nothing and reports it.
 */
export async function main(): Promise<void> {
  try {
    await emitDocument(OPENAPI_FILE, freshDocumentText)
  } catch (error) {
    console.error('openapi: the document could not be generated, and nothing was written.', error)
    process.exit(1)
  }
}

await main()
