import type { Breakdown } from '@repo/schedule'
import { BUDGET } from './field'

const BROKEN_DOWN =
  'Broken down: the timeline places this feature by its items. Its own estimate is kept rather than overwritten, so changing it moves no bar.'

/** Props for {@link BreakdownLine}. */
export interface BreakdownLineProps {
  /** The pair `breakdown()` answered, or `null` when this subject has no pair to report. */
  readonly breakdown: Breakdown | null
}

/**
 * What a feature whose items disagree with it does **not** already say: which number placed the bar.
 *
 * ### The gap is already worded, and this is not a second wording of it
 *
 * §3.2's sentence — *planned 40d · broken down to 62d · +22d* — is on screen before this component
 * exists. `rows.ts` builds it (`estimateOf`, `../table/rows.ts`), the drawer's `<dl>` prints it under
 * **Estimate** straight off the row, and `./drawer-facts.tsx` is the argument for why the drawer words
 * nothing the row already decided. So this line carries **no numbers at all**, and that is deliberate
 * rather than sparse: every number the pair holds is already somewhere a reader is looking. When the
 * two disagree, the row prints all three of `planned`, `brokenDown` and the signed delta; when they
 * agree, `estimateOf` falls through to `effectiveEstimate` and prints one number that *is* both of
 * them. There is no third case, so there is no number left to add.
 *
 * What the row cannot say is which of the two the schedule used, and that both were kept. `estimateOf`
 * prints a comparison and a canvas draws a bar; neither says that the bar came from the items and that
 * the feature's own estimate is still stored, still editable, and inert. That sentence is this
 * component, and it is the one thing here a reader could not have worked out from the cells above it.
 *
 * ### `breakdown` is read for its existence and not for its contents
 *
 * The prop is a whole {@link Breakdown} and this reads only whether it is `null` — the same honesty
 * `./drawer-facts.tsx` states about `row.blockedBy`, "on the prop and nothing reads it, which is a
 * fact a reader can check". Two properties of `breakdown()` reach the screen through that one test:
 *
 * - **`null` means there is no pair**, which is a narrower condition than "no items". It is `null`
 *   when the feature carries no authored estimate, when not one of its items carries an estimate, and
 *   always for an item — because `breakdown` compares both halves against `null` rather than for
 *   truth, so an authored `0` against a breakdown of `5` is still a pair and still reported here
 *   (`packages/schedule/src/estimate.ts`). Nothing is drawn for a `null`, so a feature nobody sized
 *   and a feature with no sized items each get silence rather than a sentence about nothing.
 * - **A negative delta is not hidden.** Nothing here branches on the sign, so a breakdown of 5 under
 *   an authored 40 renders exactly what a breakdown of 62 renders. ADR 0051 is explicit that a
 *   part-sized breakdown is "a real and reportable state — not an error", and a component that showed
 *   an overrun and swallowed a shortfall would be reporting the half that flatters the plan.
 *
 * One state this deliberately says nothing about, which is worth naming rather than discovering: a
 * feature with estimated items and **no** authored estimate is placed by its items just the same, and
 * its estimate field is just as inert, but `breakdown()` answers `null` for it because there is no
 * pair. The sentence is about the pair, so the absence of one is the absence of the sentence — and the
 * `<dl>` above already says `no estimate` for that feature, which is the fact that case is really
 * about.
 *
 * It is server-rendered, like `./drawer-facts.tsx` beside it and unlike every control: it has no
 * state, no handler and nothing to say about what was typed.
 */
export function BreakdownLine({ breakdown }: BreakdownLineProps) {
  if (breakdown === null) return null
  return (
    <p className={BUDGET} data-slot="drawer-breakdown">
      {BROKEN_DOWN}
    </p>
  )
}
