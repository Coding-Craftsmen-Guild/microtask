import { Conflict, Invalid } from '@repo/kernel'
import {
  LONGEST_QUOTED_PATH,
  collidingPaths,
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
