import { Conflict, Invalid } from '@repo/kernel'
import {
  LONGEST_QUOTED_PATH,
  collidingPaths,
  collisionWith,
  duplicatePaths,
  elideMiddle,
  type PathCollision,
} from '@repo/microtask-domain'

const quoted = (path: string): string => elideMiddle(path, LONGEST_QUOTED_PATH)

const twice = (path: string): string =>
  `This session already stages a file at "${quoted(path)}", and an archive entry cannot be appended to it. Dedupe the archive and expand it again.`

const both = (pair: PathCollision): string =>
  `This import stages "${quoted(pair.file)}" as a file and "${quoted(pair.inside)}" as a file inside it. One path cannot be both, so rename one of the two.`

/**
 * Refuses a set of paths where one of them is a file **inside** another, naming the pair.
 *
 * The 422 that replaces a 500. Both `a` and `a/b` are paths `normaliseImportPath` admits — neither
 * is malformed, and what makes them incompatible is only the other one's presence — so before this
 * existed the second of the two reached `appendBytes`, which rejected because the port's contract
 * is that a path of the wrong kind is a **fault**: `ENOTDIR` on POSIX, `ENOENT` on win32. Task 7
 * measured that as a 500 with the session intact and the byte accounting straight, which is a
 * wrong status rather than corruption, and the rule `normaliseImportPath` states is that a
 * filesystem answering a path question is exactly the 500 a 422 should have answered.
 *
 * It is **not** implemented by catching that rejection, and could not be: the port's own TSDoc says
 * callers must treat any of its codes as a fault rather than switching on one, and a `catch` wide
 * enough to cover both platforms' spellings would relabel `ENOSPC` and `EACCES` — a full volume and
 * a permission fault — as a client's bad path. So the question is answered from what the session
 * records it has staged, in memory, with no syscall, which also means the answer does not depend on
 * which of the two paths arrived first.
 *
 * The pair is reported rather than one path, because either one may be the mistake and only the
 * operator knows which.
 *
 * @throws Invalid naming the two paths, or naming the rule a path broke.
 */
export function assertNoCollision(paths: readonly string[]): void {
  const [collision] = collidingPaths(paths)
  if (collision !== undefined) throw new Invalid(both(collision))
}

/**
 * Refuses **one** arriving path against the paths a session already holds, with the same message.
 *
 * The form a chunked upload asks in, and the difference is the cost rather than the answer.
 * {@link assertNoCollision} asks about a whole set, so it re-parses every held path through
 * `normaliseImportPath` and rebuilds every ancestor of every one — and an upload would pay that
 * **per chunk**, inside the process-wide write lock, where it stalls every other write in the API.
 * Measured on win32 / Node 22.16: 85 ms per chunk at ten thousand staged files and 310 ms at fifty
 * thousand, against 0.89 ms and 3.42 ms for `collisionWith`, which asks the two questions an
 * arrival actually raises. Fifty thousand two-kilobyte files is what `MAX_SESSION_BYTES` admits, so
 * that is a reachable session and not a thought experiment.
 *
 * An expansion keeps the set form, because it brings many paths at once: one pass that normalises
 * n + m paths beats m passes over n.
 *
 * @throws Invalid naming the two paths, or naming the rule the arriving path broke.
 */
export function assertNoCollisionWith(held: readonly string[], at: string): void {
  const collision = collisionWith(held, at)
  if (collision !== null) throw new Invalid(both(collision))
}

/**
 * Refuses a set of incoming paths where one is already staged, or two of them are one path.
 *
 * Only an archive asks this. A chunked upload stages one file across many requests, so a path it
 * has already staged is the *next chunk* of that file and appending is the point; an archive names
 * every path once, in one operation, and a name it repeats — or a name the drop beside it already
 * staged — would be appended onto the bytes already there, producing a file that is two files
 * concatenated. There is no reading of that input under which the result was meant.
 *
 * A `Conflict` rather than the `Invalid` a malformed path gets, for the reason `groupImportFiles`
 * answers the same question the same way: the remedies differ, and a caller that had to tell them
 * apart by matching a message string would be reading prose to make a routing decision.
 *
 * @throws Conflict naming the path claimed twice.
 * @throws Invalid naming the rule a path broke.
 */
export function assertFreshPaths(held: readonly string[], incoming: readonly string[]): void {
  const [duplicate] = duplicatePaths([...held, ...incoming])
  if (duplicate !== undefined) throw new Conflict(twice(duplicate))
}
