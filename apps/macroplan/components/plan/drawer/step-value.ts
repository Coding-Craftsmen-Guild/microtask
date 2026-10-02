import { MAX_ESTIMATE_DAYS } from '@repo/contracts'

/** The grain every stepper moves in: half a working day, which is the finest the contract takes. */
export const STEP_DAYS = 0.5

/** An estimate as the field shows it: a bare number, or nothing at all for work nobody has sized. */
export const shownDays = (days: number | null): string => (days === null ? '' : String(days))

/**
 * Where one press of a stepper lands, from whatever the field is showing now.
 *
 * Unsized work steps from **zero**, so the first press of `+` on an item nobody has estimated reads
 * half a day rather than nothing happening. The floor is `0` and not half a day: `0` is a milestone in
 * this product — work reached and taking no time — and a stepper that could not reach it would be a
 * stepper that cannot say "this is a date, not a task" (`values.ts` argues the pair). The ceiling is
 * the contract's own, so a long press cannot walk a field into a 422.
 *
 * Rounding to halves is what makes a long press safe: floating-point addition of `0.5` drifts, and a
 * value of `2.4999999999` is refused by `estimateEntry` as a finer grain than the contract takes.
 *
 * @param days - What the field holds now, or `null` for nothing sized.
 * @param delta - How far to move, in days: one {@link STEP_DAYS} either way.
 * @returns The next value, in halves, inside the contract's range.
 */
export const steppedDays = (days: number | null, delta: number): number => {
  const next = Math.round(((days ?? 0) + delta) * 2) / 2
  return Math.min(Math.max(next, 0), MAX_ESTIMATE_DAYS)
}

/** What each stepper button is called, since a glyph is no name for a control. */
export const STEP_WORDS = {
  less: 'Half a day less',
  more: 'Half a day more',
  minus: String.fromCharCode(0x2212),
  plus: '+',
} as const
