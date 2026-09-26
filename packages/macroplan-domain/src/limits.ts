import { Invalid } from '@repo/kernel'
import { LIMITS, MAX_ITEM_DESCRIPTION_BYTES, type PlanCountKey } from '@repo/contracts'

export {
  LIMITS,
  MAX_ITEM_DESCRIPTION_BYTES,
  type CountLimitKey,
  type LimitKey,
} from '@repo/contracts'

const LABEL: Readonly<Record<PlanCountKey, string>> = {
  plansPerProduct: 'plans',
  epicsPerPlan: 'epics in this plan',
  labelsPerPlan: 'labels in this plan',
  featuresPerPlan: 'features in this plan',
  itemsPerPlan: 'items in this plan',
  edgesPerPlan: 'dependency edges in this plan',
  shareLinksPerPlan: 'share links for this plan',
}

const strippedControlCodes = (): readonly number[] => {
  const c0 = [...Array(32).keys()].filter((code) => code !== 9 && code !== 10)
  return [...c0, 127]
}

const CONTROL_CHARS = new RegExp(
  `[${strippedControlCodes().map((code) => String.fromCharCode(code)).join('')}]`,
  'gu',
)

const byteLength = (value: string): number => new TextEncoder().encode(value).length

const truncateToBytes = (value: string, maxBytes: number): string => {
  if (byteLength(value) <= maxBytes) return value
  let result = ''
  let used = 0
  for (const point of value) {
    const pointBytes = byteLength(point)
    if (used + pointBytes > maxBytes) break
    result += point
    used += pointBytes
  }
  return result
}

/** Collapses whitespace, trims, and caps a display name. Re-exported from the shared rule. */
export function cleanName(value: unknown, fallback?: string): string {
  if (typeof value !== 'string') {
    if (fallback !== undefined) return fallback
    throw new Invalid('Name is required')
  }
  const collapsed = value.replace(/\s+/g, ' ').trim()
  const cleaned = [...collapsed].slice(0, LIMITS.nameLength).join('').trim()
  if (cleaned.length > 0) return cleaned
  if (fallback !== undefined) return fallback
  throw new Invalid('Name is required')
}

/**
 * Normalises and caps one item's plain-text description.
 *
 * Normalises `\r\n` and lone `\r` to `\n`; strips every C0 control character except `\n` and
 * `\t`, and strips `U+007F`; then truncates to `MAX_ITEM_DESCRIPTION_BYTES` in **UTF-8 bytes**,
 * never cutting a code point in half. The truncation walks the string one code point at a time
 * (`for...of`, not indexing) so a surrogate pair is measured and kept or dropped whole — the same
 * reason `cleanName` above slices with `[...value]` rather than `.slice()`.
 *
 * This is the plain-text analogue of ADR 0029's document sanitiser, not an HTML sanitiser: there
 * is no HTML here, the value is stored and returned as text, and phase 2 renders it as text. The
 * contract's `.max()` on this same field counts UTF-16 units — a backstop, not the real limit,
 * because this repo has already shipped that exact character-vs-byte mistake once.
 *
 * The stripped set — every C0 control code except tab and newline, plus DEL — is built from
 * character codes with `String.fromCharCode` rather than a regex literal spelling out `u0000`
 * -style escapes: none of those codes are regex metacharacters, and a literal escape sequence in
 * this file is exactly the kind of thing a tool in this pipeline has silently mangled into a raw
 * control byte before.
 */
export function cleanDescription(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalised = value.replace(/\r\n|\r/gu, '\n').replace(CONTROL_CHARS, '')
  return truncateToBytes(normalised, MAX_ITEM_DESCRIPTION_BYTES)
}

/**
 * Throws Invalid when adding one more would exceed a bound.
 *
 * Narrowed to Macroplan's half of the count bounds, because no Microtask key can reach it: a
 * `*-domain` package may not import another (ADR 0014), so this is a re-implementation over the
 * same `@repo/contracts` constants rather than a call into `@repo/microtask-domain`. `nameLength`
 * is absent for the reason {@link cleanName} gives: it truncates, and never throws.
 */
export function assertWithin(key: PlanCountKey, current: number): void {
  if (current >= LIMITS[key]) {
    throw new Invalid(`Too many ${LABEL[key]} — the limit is ${LIMITS[key]}`)
  }
}
