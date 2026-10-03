import { LIMITS } from '@repo/contracts'

const WHITESPACE = /\s+/g

/**
 * A name as the API will store it, or `null` for one the API will refuse.
 *
 * The browser's copy of `cleanName` in `@repo/macroplan-domain`'s `limits.ts`, for the reason every file
 * in this directory exists: an optimistic rename shows what the server is about to store, so that its
 * answer a round trip later changes nothing on screen (ADR 0069). Whitespace runs collapse, the ends are
 * trimmed, and the cut is in code points — `[...value]` — because that is the domain's unit and a UTF-16
 * slice would split an emoji the server keeps whole.
 *
 * `null` rather than a throw, because nothing here refuses anything: an optimistic edit that cannot know
 * the answer leaves the name alone, and the API's own refusal is what the field then says.
 *
 * @param value - What was typed.
 * @returns The stored form, or `null` when nothing would be left.
 */
export function cleanName(value: string): string | null {
  const collapsed = value.replace(WHITESPACE, ' ').trim()
  const cleaned = [...collapsed].slice(0, LIMITS.nameLength).join('').trim()
  return cleaned === '' ? null : cleaned
}
