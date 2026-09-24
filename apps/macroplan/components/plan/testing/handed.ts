import { isValidElement } from 'react'
import type { ReactNode } from 'react'

/** Everything one render tree hands a component, split by the two things a token can travel as. */
export interface Handed {
  /** Every string anywhere in the tree, each element's `key` included. */
  readonly strings: readonly string[]

  /** The name of every function the tree hands over, which is all reflection can see of one. */
  readonly functions: readonly string[]
}

const keysOf = (value: object): readonly string[] =>
  isValidElement(value) && typeof value.key === 'string' ? [value.key] : []

const childrenOf = (value: object): readonly unknown[] =>
  Object.values(isValidElement(value) ? (value.props as object) : value)

interface Found {
  readonly strings: string[]
  readonly functions: string[]
}

const sweep = (value: unknown, found: Found, seen: WeakSet<object>): void => {
  if (typeof value === 'string') {
    found.strings.push(value)
    return
  }
  if (typeof value === 'function') {
    found.functions.push(value.name)
    return
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  found.strings.push(...keysOf(value))
  for (const child of childrenOf(value)) sweep(child, found, seen)
}

/**
 * Everything a rendered tree hands down, walked reflectively: every string, every `key`, every
 * function.
 *
 * One walker in one place, because three surfaces run it — `[planId]/layout.tsx`, which is where the
 * plan read lives, and each of the two drawer pages, which read the very same plan the API answers an
 * admin with every live token on. Each of those files carried a byte-identical copy of it before this
 * existed, and a sweep of the leak three copies guard is the last thing that should be able to drift
 * in one of them: a copy that stopped reading `key`, or stopped recording functions, would keep
 * passing.
 *
 * Two things it can and cannot see, which is the whole reason it returns two lists:
 *
 * 1. **Strings, keys included.** `keysOf` above is why: React moves `key` out of `props` onto the
 *    element, so `<div key={token}>` is invisible to a walk that descends into `props` alone — and
 *    React does serialise keys into the Flight payload. Each caller plants one to prove that.
 * 2. **Functions, by name only.** A bound argument is unreachable by reflection:
 *    `action.bind(null, token)` exposes neither the token nor its own name, so no walk can see inside
 *    one — and that is exactly the mechanism ADR 0040 describes for handing a token to a component.
 *    What *is* checkable is whether a surface hands over a function **at all**, so every function met
 *    is recorded and each caller asserts the list is empty. The first bound server action therefore
 *    fails that assertion rather than passing it quietly, and whoever adds it owes a walk that reads a
 *    bound function's arguments.
 *
 * `app/s/[token]/page.test.tsx` deliberately keeps its own narrower walker rather than calling this
 * one: its KNOWN GAP comment is about that walker, and the comment is the record.
 *
 * @param element - The tree a page or a layout returned, exactly as it returned it.
 * @returns Every string and every function name the walk reached, unfiltered.
 */
export const handedBy = (element: ReactNode): Handed => {
  const found: Found = { strings: [], functions: [] }
  sweep(element, found, new WeakSet())
  return found
}

/**
 * Which of a known set of secrets a tree hands down, by substring rather than by equality.
 *
 * By substring because a token is as leaked inside `seat <token>` as it is alone, and the set is
 * passed in rather than recognised by shape: `ShareToken` admits sixteen to sixty-four url-safe
 * characters with no prefix, and a ULID satisfies that too, so recognising a token by its shape would
 * demand that every plan id be a leak.
 *
 * @param element - The tree a page or a layout returned.
 * @param tokens - Every token the test world holds, read off the fixture rather than listed.
 * @returns Each string handed down that contains one of them, which must be none.
 */
export const tokensHandedBy = (element: ReactNode, tokens: readonly string[]): readonly string[] =>
  handedBy(element).strings.filter((one) => tokens.some((token) => one.includes(token)))
