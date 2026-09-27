import type { Attention } from './attention'
import { ATTENTION_WHY, needsAttention } from './attention-words'
import { MARK } from './attention-css'

/** Props for {@link AttentionDot}. */
export interface AttentionDotProps {
  /** Everything wrong with this one entity; nothing renders when it is empty. */
  readonly on: readonly Attention[] | undefined
}

/**
 * The mark a row carries when something about it wants looking at.
 *
 * A dot and a `title`, not a sentence: this sits at the end of a sidebar row that already has a name
 * competing for the width, and the row's job is to be scannable. The detail is one hover away and,
 * more importantly, is written out in full in the drawer the row opens.
 */
export function AttentionDot({ on }: AttentionDotProps) {
  if (on === undefined || on.length === 0) return null
  return (
    <span
      className={MARK.dot}
      data-slot="attention-dot"
      role="img"
      title={on.map((each) => each.detail).join(' · ')}
    />
  )
}

/** Props for {@link AttentionChip}. */
export interface AttentionChipProps {
  /** How many entities want looking at. Nothing renders for none. */
  readonly count: number
}

/**
 * The plan-wide count, next to the plan's calendar.
 *
 * It is a statement and not a control. The first instinct was to make it filter the page, but a
 * count that is also a toggle is a count nobody trusts — and the sidebar already has a filter that
 * does the job, next to the tree it filters.
 */
export function AttentionChip({ count }: AttentionChipProps) {
  if (count <= 0) return null
  return (
    <span className={MARK.chip} data-slot="attention-chip">
      <span className={MARK.dot} />
      {needsAttention(count)}
    </span>
  )
}

/** Props for {@link AttentionCallout}. */
export interface AttentionCalloutProps {
  readonly on: readonly Attention[] | undefined
}

/**
 * Everything wrong with one entity, written out, at the top of that entity's drawer.
 *
 * This is where the conflict panel's sentences went. They are better here: the reader opened this
 * drawer to work on this thing, the subject needs no re-naming, and the controls that resolve the
 * complaint — an estimate field, a dependency editor — are directly underneath.
 */
export function AttentionCallout({ on }: AttentionCalloutProps) {
  if (on === undefined || on.length === 0) return null
  return (
    <div className={MARK.callout} data-slot="attention-callout" role="note">
      {on.map((each) => (
        <p className={MARK.calloutRow} key={each.kind}>
          <span className={MARK.calloutKind}>{each.detail}</span>
          <span className={MARK.calloutWhy}>{ATTENTION_WHY[each.kind] ?? ''}</span>
        </p>
      ))}
    </div>
  )
}
