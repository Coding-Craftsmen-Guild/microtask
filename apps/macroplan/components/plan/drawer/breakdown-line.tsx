import { BUDGET } from './field'

const BROKEN_DOWN =
  'Broken down: the timeline places this feature by its items. Its own estimate is kept rather than overwritten, so changing it moves no bar.'

/** Props for {@link BreakdownLine}. */
export interface BreakdownLineProps {
  /** Whether the items sized this feature: `effectiveEstimate` took them (`./subject.ts`). */
  readonly sizedByItems: boolean
}

/**
 * What a feature the timeline sized from its items does **not** already say: which number placed the bar.
 *
 * ### The numbers are already worded, and this is not a second wording of them
 *
 * §3.2's sentence — *planned 40d · broken down to 62d · +22d* — is on screen before this component
 * exists. `rows.ts` builds it (`estimateOf`, `../table/rows.ts`), the drawer's `<dl>` prints it under
 * **Estimate** straight off the row, and `./drawer-facts.tsx` is the argument for why the drawer words
 * nothing the row already decided. So this line carries **no numbers at all**, and that is deliberate
 * rather than sparse: every number there is to print is already somewhere a reader is looking. When an
 * authored estimate and the items disagree, the row prints all three of `planned`, `brokenDown` and the
 * signed delta; when they agree, `estimateOf` falls through to `effectiveEstimate` and prints one number
 * that *is* both of them; when nothing was authored, that same fall-through prints the items' own sum
 * alone. Each of the three is the row's to word, so there is no number left to add.
 *
 * What the row cannot say is which of the two the schedule used, and that both were kept. `estimateOf`
 * prints a number and a canvas draws a bar; neither says that the bar came from the items and that the
 * feature's own estimate is still stored, still editable, and inert. That sentence is this component,
 * and it is the one thing here a reader could not have worked out from the cells above it.
 *
 * ### The condition is *at least one estimated item*, and not *there is a pair*
 *
 * `effectiveEstimate` is what places the bar, and its gate is **at least one estimated item**: the sum
 * of the estimated items whenever one of them is sized, and the authored value otherwise
 * (`packages/schedule/src/estimate.ts`). That gate is this sentence's condition, because it is exactly
 * the set of features whose own estimate moves nothing.
 *
 * `breakdown()` is narrower — it wants an authored estimate **and** a sized item, comparing both halves
 * against `null` rather than for truth, so an authored `0` against a breakdown of `5` is a pair — and
 * this line used to be drawn on it. That left one state silent, and it was the worst one to be silent
 * in: a feature with items of 3 and 2 and **no** authored estimate is placed by its items just the
 * same, its Estimate cell reads `5d` because `estimateOf` falls through to `effectiveEstimate`, and the
 * estimate field beside that cell is **empty**, `shown(null)` being `''` (`./estimate-field.tsx`). The
 * field looks as though it has lost the number the cell is showing, and typing `40` into it changes the
 * cell and moves no bar. An earlier wording of this note excused the silence on the ground that the
 * `<dl>` above "already says `no estimate` for that feature"; it does not. `no estimate` is what
 * `estimateOf` prints when `effectiveEstimate` answers `null`, which needs no item of the feature to be
 * sized at all.
 *
 * So the prop is one boolean and `./subject.ts` resolves it, by asking `breakdown()` and
 * `effectiveEstimate()` themselves and reimplementing the gate of neither. `false` covers the three
 * states where a feature's own estimate is the one that places it — nobody sized it, no item of it is
 * sized, it has no items — and every item there has ever been, an item having no items of its own.
 * Nothing is drawn for a `false`, so a feature whose own estimate is live gets silence rather than a
 * sentence about nothing.
 *
 * **A shortfall and an overrun are one sentence.** There is no number here to carry a sign, so a
 * breakdown of 5 under an authored 40 renders exactly what a breakdown of 62 renders. ADR 0051 is
 * explicit that "a part-sized breakdown under a whole-feature estimate, is a real and reportable state;
 * `planned` is never edited to force it to zero", and a component
 * that showed an overrun and swallowed a shortfall would be reporting the half that flatters the plan.
 *
 * It is server-rendered, like `./drawer-facts.tsx` beside it and unlike every control: it has no state,
 * no handler and nothing to say about what was typed.
 */
export function BreakdownLine({ sizedByItems }: BreakdownLineProps) {
  if (!sizedByItems) return null
  return (
    <p className={BUDGET} data-slot="drawer-breakdown">
      {BROKEN_DOWN}
    </p>
  )
}
