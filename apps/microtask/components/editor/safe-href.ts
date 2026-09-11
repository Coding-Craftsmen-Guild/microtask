import { SAFE_HREF_SCHEMES } from '@repo/contracts'

const SCHEME = /^([a-z][a-z0-9+.-]*):/i

const SAFE = new Set<string>(SAFE_HREF_SCHEMES)

const isIgnored = (code: number): boolean => code <= 0x20 || (code >= 0x7f && code <= 0x9f)

const trimIgnored = (value: string): string => {
  let start = 0
  let end = value.length
  while (start < end && isIgnored(value.charCodeAt(start))) start += 1
  while (end > start && isIgnored(value.charCodeAt(end - 1))) end -= 1
  return value.slice(start, end)
}

const hasIgnored = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (isIgnored(value.charCodeAt(index))) return true
  }
  return false
}

/**
 * The href to store for what a user typed into the link dialog, or `null` to refuse it.
 *
 * Refusing happens **before** the request is sent, so a `javascript:` URL never reaches the
 * server guard that would also reject it (ADR 0029) — the client is the layer that can say why.
 *
 * "A character a browser ignores" means C0 up to and including space, plus C1 `0x7f`–`0x9f`:
 * the same bounds the boundary guard removes before it matches a scheme (ADR 0029). That test
 * is a predicate over code points rather than a character class, because ESLint's
 * `no-control-regex` rejects every spelling of the equivalent regex and ADR 0027 leaves no
 * file-level `eslint-disable` to hide behind.
 *
 * Three rules, in order:
 *
 * 1. Characters a browser ignores are trimmed from both ends, because ` javascript:alert(1)`
 *    is a `javascript:` URL to every browser and carries no scheme at all to a naive regex.
 * 2. An href still holding such a character **anywhere** is refused rather than repaired.
 *    `java<TAB>script:alert(1)` executes, and the repair would be the thing deciding what the
 *    user meant; a refusal makes them retype it. It is also why a legitimate URL with an
 *    interior space is refused instead of silently re-pointed at a different target.
 * 3. What carries a scheme keeps it when {@link SAFE_HREF_SCHEMES} names it and is refused
 *    otherwise; what carries none gets `https://` prepended, which is what the app being
 *    replaced did and what makes `example.com` a working link.
 *
 * The empty string is refused, so "clear this link" stays a decision the caller makes rather
 * than a value this function invents an href for.
 */
export function normalizeHref(raw: string): string | null {
  const href = trimIgnored(raw)
  if (href === '' || hasIgnored(href)) return null
  const scheme = SCHEME.exec(href)?.[1]
  if (scheme === undefined) return `https://${href}`
  return SAFE.has(scheme.toLowerCase()) ? href : null
}
