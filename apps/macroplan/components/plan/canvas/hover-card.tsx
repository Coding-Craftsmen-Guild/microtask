import { Fragment } from 'react'
import type { Detail } from './detail-lines'
import { CARD } from './pointer-css'

/** Props for {@link HoverCard}. */
export interface HoverCardProps {
  /** The card's own words, already split out of the attribute the mark carried. */
  readonly detail: Detail

  readonly left: number

  readonly top: number
}

/**
 * The short window a hover puts up: what the thing is, then a few facts about it.
 *
 * A `<dl>`, because every line is a term and its value — which is what a description list is for, and
 * what makes the pairing survive a reader's own stylesheet. It is `aria-hidden` all the same, for the
 * reason `drag-ghost.tsx` is: it is a visual echo of facts already in the accessibility tree, and the
 * reading of them a screen reader gets is the table, which gives each one a cell with a header.
 *
 * Nothing here decides anything. The wording is `detail-lines.ts`'s — the table's own, so the two
 * renderings cannot disagree — the position is `pointer-view.ts`'s, and what to show is
 * `plan-pointer.tsx`'s. This is the markup, which is why it takes three plain values and holds no state.
 */
export function HoverCard({ detail, left, top }: HoverCardProps) {
  return (
    <div aria-hidden="true" className={CARD.root} data-slot="hover-card" style={{ left, top }}>
      <p className={CARD.title}>{detail.title}</p>
      {detail.lines.length === 0 ? null : (
        <dl className={CARD.rows}>
          {detail.lines.map((line) => (
            <Fragment key={line.label}>
              <dt className={CARD.label}>{line.label}</dt>
              <dd className={CARD.value}>{line.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  )
}
