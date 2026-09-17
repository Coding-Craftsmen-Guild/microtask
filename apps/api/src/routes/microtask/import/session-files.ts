import { NotFound } from '@repo/kernel'
import {
  SEPARATOR,
  sessionMarkerFile,
  stagedFile,
  stagedRoot,
  stagingDir,
  type ImportFile,
} from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { PRODUCT } from '../product.js'
import { readMarker } from './session-marker.js'

const NO_SESSION = 'Import session not found'

const BOM = 0xfeff

const AT_ROOT = ''

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw.charCodeAt(0) === BOM ? raw.slice(1) : raw) as unknown
  } catch {
    return null
  }
}

const dirAt = (root: string, sessionId: string, at: string): string =>
  at === AT_ROOT ? stagedRoot(root, PRODUCT, sessionId) : stagedFile(root, PRODUCT, sessionId, at)

const childOf = (at: string, name: string): string =>
  at === AT_ROOT ? name : `${at}${SEPARATOR}${name}`

async function pathsUnder(
  deps: ApiDeps,
  sessionId: string,
  at: string,
): Promise<readonly string[]> {
  const dir = dirAt(deps.config.dataDir, sessionId, at)
  const found: string[] = (await deps.fileSystem.listFiles(dir)).map((name) => childOf(at, name))
  for (const name of await deps.fileSystem.listDirs(dir)) {
    found.push(...(await pathsUnder(deps, sessionId, childOf(at, name))))
  }
  return found
}

/**
 * Reads every file one staged session holds, parsed, at the path it was staged under.
 *
 * **Lock-free, deliberately, and that is the whole reason it is here rather than on
 * `ImportStaging`.** Every public method of that class takes `lock.run` itself and so may not be
 * called from inside one — `QueueLock` is not reentrant, and its failure is not a slow import:
 * the inner `run` chains onto a promise that settles only when the outer work returns, and the
 * outer work is awaiting the inner one, so `#chain` is left pointing at a promise that never
 * settles and every subsequent write in the process hangs while reads keep answering 200. A
 * confirm holds one lock around its whole apply and reads the session from inside it, so the
 * reader cannot be one of those methods. A preview needs no lock at all: it writes nothing, and
 * every other read in this codebase takes none for the reason `bundleWorkspace` states — a read
 * holding the write queue stalls every client.
 *
 * The session is enumerated from **the volume** rather than from the marker's `paths` list, even
 * though that list exists and is cheaper. The marker is accounting and not an inventory: an
 * expansion removes the archive before rewriting the marker, so an interruption between the two
 * leaves the marker naming a file that is gone — and a preview built from it would have to either
 * skip that row silently, which is the failure ADR 0018 exists to close, or refuse the whole
 * session over debris. What is on disk is what is previewed, and what is previewed is what is
 * written.
 *
 * The recursion below is bounded by **what the writers normalised**, not by anything it checks
 * itself: `pathsUnder` walks `fileSystem.listDirs` and never calls `normaliseImportPath`. Every
 * path a session holds was staged through a route that did — an upload's `path` query and an
 * archive's entry names both go through it, and it caps a path at 1,024 characters and therefore a
 * nesting depth at 512 — so the depth here is 512 for the tree this product wrote, and is whatever
 * the volume holds for a tree it did not. That is a weaker guarantee than the normaliser applied
 * here would be, and it is the accurate one: a directory a hand or an unrelated process created
 * under the staging root is walked to whatever depth it has.
 *
 * A file whose bytes are not JSON comes back as `json: null`, which classification reports as a
 * row rather than a throw: a drop of ten directories where one holds a truncated file still has
 * nine to describe. A leading U+FEFF is stripped before the parse, because `JSON.parse` refuses
 * one — measured on Node 22.16: `{}` prefixed with a byte-order mark throws `SyntaxError:
 * Unexpected token`, and a legacy export saved by a Windows editor is exactly the file carrying
 * one. Stripping is safe where repairing would not be: the mark is not content, and the file is
 * either JSON without it or refused either way.
 *
 * Bytes rather than `readText` per file, for the reason `readBytes` exists: a chunk boundary falls
 * wherever the transport put it, so a reassembled file must be decoded once, whole.
 *
 * **The files are read one at a time.** `bundleWorkspace` measured the alternative against a real
 * volume: unbounded concurrent `readTask` died with `EMFILE: too many open files` near ten
 * thousand open handles, and a session admits fifty thousand two-kilobyte files under
 * `MAX_SESSION_BYTES`. A `Promise.all` over the whole session is therefore reachable rather than
 * theoretical, and `EMFILE` would reach a client as an unmapped 500 quoting an internal path.
 *
 * @throws NotFound when no session marker is there — expired, swept, or never opened.
 */
export async function readStagedFiles(
  deps: ApiDeps,
  sessionId: string,
): Promise<readonly ImportFile[]> {
  const marker = sessionMarkerFile(deps.config.dataDir, PRODUCT, sessionId)
  if (readMarker(await deps.fileSystem.readText(marker)) === null) throw new NotFound(NO_SESSION)
  const decoder = new TextDecoder()
  const found: ImportFile[] = []
  for (const path of await pathsUnder(deps, sessionId, AT_ROOT)) {
    const at = stagedFile(deps.config.dataDir, PRODUCT, sessionId, path)
    const bytes = await deps.fileSystem.readBytes(at)
    found.push({ path, json: bytes === null ? null : parsed(decoder.decode(bytes)) })
  }
  return found
}

/**
 * Removes one session and everything staged under it, whether or not it was ever there.
 *
 * Lock-free for {@link readStagedFiles}' reason: a confirm sweeps the session it just applied from
 * inside the lock it already holds (ADR 0045). `removeDir` and not `remove` because a session
 * directory holds a marker, a tree of uploads, and — between an upload and its expansion — a file
 * at a path that will be a directory afterwards, so its kind is not something a sweep should have
 * to know.
 */
export async function discardSession(deps: ApiDeps, sessionId: string): Promise<void> {
  await deps.fileSystem.removeDir(stagingDir(deps.config.dataDir, PRODUCT, sessionId))
}
