import path from 'node:path'
import { Invalid } from './errors.js'

/**
 * Resolves `target` and returns it only when it lands strictly inside `parent`.
 *
 * Strictly: a target resolving to `parent` itself is rejected too, since no legitimate
 * path builder produces one. This is the backstop, not the primary defence — the one ADR
 * 0005 records for the project directory and ADR 0050 records for the plan directory.
 * `isUlid` and `isProduct` reject an untrusted segment outright, which is why no public
 * builder can reach the throw and why this module is tested directly.
 *
 * @throws Invalid when the resolved target escapes `parent` or equals it.
 */
export function contained(parent: string, target: string): string {
  const base = path.resolve(parent)
  const resolved = path.resolve(target)
  if (!resolved.startsWith(base + path.sep)) {
    throw new Invalid('Path escapes its parent directory')
  }
  return resolved
}
