const FALLBACK = '/'
const BASE = 'http://next-path.invalid'

/**
 * The longest `?next=` this app will honour.
 *
 * A bound rather than a rule about content: the value ends up in a `Location` header, and an
 * unbounded one is a way to make this app emit a header a proxy in front of it has to decide
 * what to do with. Nothing legitimate here is close — the deepest route is
 * `/p/<ulid>/t/<ulid>?tab=<ulid>`.
 */
export const MAX_NEXT_LENGTH = 512

const hostile = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Reduces an untrusted `?next=` to a same-origin path, or to `/`.
 *
 * An open redirect on a login form is the classic version of this bug and a scheme allowlist is
 * the classic wrong fix, so the rule here is a shape rule and it is closed rather than open: the
 * value must begin with a single `/` that is not followed by another `/` or by a `\`, and it must
 * contain no control character, no space and no DEL.
 *
 * Each clause is load-bearing against a real bypass rather than a hypothetical one:
 *
 * - `//host` is protocol-relative — the browser reads it as an absolute URL on the current
 *   scheme, so it leaves this origin without ever naming one.
 * - `/\host` and `\\host` are the same attack through a backslash: WHATWG URL parsing normalises
 *   `\` to `/` for HTTP URLs, so a browser resolves `/\evil.example` to `//evil.example`.
 * - A tab, a newline or a NUL inside the value is **stripped** by browsers before the URL is
 *   parsed, which is how a tab between two slashes becomes `//evil.example`. Rejecting the whole
 *   C0 range plus space and DEL covers every member of that family at once, rather than the
 *   three that happened to be on a test list.
 * - Anything not starting with `/` at all — an absolute URL, `javascript:`, `data:`, a bare
 *   hostname — fails the first clause without this function having to know what a scheme is.
 *
 * The `URL` re-parse underneath is not redundant: it is a second, independent opinion from the
 * same parser the browser uses, and a candidate whose resolved origin is not the base origin is
 * refused whatever the character rules made of it.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return FALLBACK
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK
  if (hostile(raw)) return FALLBACK
  try {
    const resolved = new URL(raw, BASE)
    if (resolved.origin !== BASE) return FALLBACK
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return FALLBACK
  }
}

/**
 * The login URL an expired or absent admin session is sent to, carrying where it was going.
 *
 * The deep link is preserved because losing it is a recorded defect: the app being replaced sent
 * every expiry to `/` and made an admin navigate back to the task they were on (ADR 0032). The
 * parameter is omitted entirely for `/`, so the common case has no redundant query string to
 * round-trip through {@link safeNextPath} on the way back.
 */
export function loginPathFor(raw: string | null | undefined): string {
  const next = safeNextPath(raw)
  return next === FALLBACK ? '/login' : `/login?next=${encodeURIComponent(next)}`
}
