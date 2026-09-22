import path from 'node:path'
import { contained, Invalid, isProduct, isUlid, type Product } from '@repo/kernel'
import { normaliseImportPath } from '../import/harvested-path.js'

const MANIFEST = 'project.json'
const TASKS = 'tasks'
const PROJECTS = 'projects'
const IMPORT = 'import'
const BUILD = 'build'
const STAGED = 'files'
const MARKER = 'session.json'
const PROJECT_ID = 'Project id must be a ULID'
const TASK_ID = 'Task id must be a ULID'

const productRoot = (root: string, product: Product): string => {
  if (!isProduct(product)) throw new Invalid('Unknown product')
  return contained(root, path.join(root, product))
}

const inside = (parent: string, segment: string): string =>
  contained(parent, path.join(parent, segment))

const manifestIn = (dir: string): string => inside(dir, MANIFEST)

const taskIn = (dir: string, taskId: string): string => {
  if (!isUlid(taskId)) throw new Invalid(TASK_ID)
  return inside(inside(dir, TASKS), `${taskId}.json`)
}

/** Resolves the directory holding every project for one product. */
export function projectsDir(root: string, product: Product): string {
  return inside(productRoot(root, product), PROJECTS)
}

/** Resolves the directory holding one project's files. */
export function projectDir(root: string, product: Product, projectId: string): string {
  if (!isUlid(projectId)) throw new Invalid(PROJECT_ID)
  return inside(projectsDir(root, product), projectId)
}

/** Resolves the file holding one project's manifest. */
export function manifestFile(root: string, product: Product, projectId: string): string {
  return manifestIn(projectDir(root, product, projectId))
}

/** Resolves the directory holding one project's task files. */
export function tasksDir(root: string, product: Product, projectId: string): string {
  return inside(projectDir(root, product, projectId), TASKS)
}

/** Resolves the file holding one task's tabs. */
export function taskFile(
  root: string,
  product: Product,
  projectId: string,
  taskId: string,
): string {
  return taskIn(projectDir(root, product, projectId), taskId)
}

/**
 * Resolves the root holding every import session being staged for one product.
 *
 * A **sibling** of {@link projectsDir} rather than anything under it, which is the whole of ADR
 * 0045: `FsProjectStore.listManifests` reads the immediate ULID-named children of `projectsDir`
 * and reads a `project.json` out of each, so a session staged one level inside that root would be
 * indistinguishable from a live project — listed for the admin, and its share tokens loaded as
 * live credentials by `warmTokenIndex` at the next restart, unconfirmed and unvalidated.
 *
 * It is the enumeration point for the opportunistic TTL sweep, which is why it is exported rather
 * than left private to {@link stagingDir}: sweeping means listing the session ids that exist, and
 * a caller that cannot name this root cannot ask.
 */
export function stagingRoot(root: string, product: Product): string {
  return inside(productRoot(root, product), IMPORT)
}

/**
 * Resolves the directory holding one import session.
 *
 * The session id is checked with the same `isUlid` guard a project id gets, before it is joined
 * onto anything. That check still belongs here rather than inside `contained()`: the containment
 * primitive is only a resolved-prefix test — a backstop, not the defence — so a caller reaching for
 * it directly would still have to restate the ULID rule at its own call site.
 */
export function stagingDir(root: string, product: Product, sessionId: string): string {
  if (!isUlid(sessionId)) throw new Invalid('Import session id must be a ULID')
  return inside(stagingRoot(root, product), sessionId)
}

/**
 * Resolves the file recording when one session was opened.
 *
 * A marker file rather than the session directory's mtime, because the clock is injected
 * everywhere else here and a sweep measured against mtimes could only be tested by touching them
 * — which is a case that gets skipped on one platform (ADR 0045).
 *
 * It sits **beside** the uploads rather than among them: {@link stagedFile} puts every uploaded
 * file under one more segment, so no path a client can send addresses this file. Sharing the
 * directory would let an upload named `session.json` overwrite the session's own bookkeeping.
 */
export function sessionMarkerFile(root: string, product: Product, sessionId: string): string {
  return inside(stagingDir(root, product, sessionId), MARKER)
}

/**
 * Resolves the directory every uploaded file of one session sits under.
 *
 * The root {@link stagedFile} joins a harvested path onto, exported because reading a session back
 * means enumerating what is in it and a caller that cannot name this directory cannot start. It is
 * one segment below the session directory so that no path a client sends can address
 * {@link sessionMarkerFile}, which is the reason that segment exists at all.
 */
export function stagedRoot(root: string, product: Product, sessionId: string): string {
  return inside(stagingDir(root, product, sessionId), STAGED)
}

/**
 * Resolves one uploaded file inside a session, from the relative path the drop was harvested at.
 *
 * The path goes through `normaliseImportPath` here rather than only at the call site, which makes
 * this builder self-guarding in exactly the way {@link projectDir} is: an id-shaped segment gets
 * `isUlid`, and a harvested path gets the one normaliser that is the server's authority on what a
 * path may be. It rejects an absolute path, a `..` segment, a drive letter, a backslash and a
 * control character, so `contained()` below is a backstop rather than the defence. Calling it
 * twice is harmless — its output is a fixed point of it — so a route that needs the normalised
 * path for its response can normalise first and pass the result straight in.
 */
export function stagedFile(
  root: string,
  product: Product,
  sessionId: string,
  harvested: string,
): string {
  const parent = stagedRoot(root, product, sessionId)
  return contained(parent, path.join(parent, normaliseImportPath(harvested)))
}

/**
 * Resolves the root holding projects being assembled before they are moved into place.
 *
 * A sibling of `projects/` for the same reason {@link stagingRoot} is, plus one of its own: it has
 * to be on the **same filesystem** as `projects/`, or ADR 0006's final step is a copy rather than
 * a rename and stops being atomic. A move between two roots under one data directory is a rename.
 */
export function buildRoot(root: string, product: Product): string {
  return inside(productRoot(root, product), BUILD)
}

/** Resolves the directory one project is assembled in before it is moved into place. */
export function buildDir(root: string, product: Product, projectId: string): string {
  if (!isUlid(projectId)) throw new Invalid(PROJECT_ID)
  return inside(buildRoot(root, product), projectId)
}

/**
 * Resolves the manifest of a project being assembled, inside its build directory.
 *
 * A second pair of builders rather than a `dir` argument on {@link manifestFile}, because the
 * roots are what ADR 0045 keeps apart and a builder taking a directory would let a caller pass
 * `projectsDir` — the one mistake that ADR exists to make unreachable. The layout inside the two
 * directories is deliberately identical, which is what makes the publish a rename of a directory
 * that is already shaped like a project rather than a per-file copy.
 */
export function buildManifestFile(root: string, product: Product, projectId: string): string {
  return manifestIn(buildDir(root, product, projectId))
}

/** Resolves one task file of a project being assembled, inside its build directory. */
export function buildTaskFile(
  root: string,
  product: Product,
  projectId: string,
  taskId: string,
): string {
  return taskIn(buildDir(root, product, projectId), taskId)
}
