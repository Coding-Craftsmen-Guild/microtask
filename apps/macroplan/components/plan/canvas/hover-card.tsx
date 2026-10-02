import type { Detail } from './detail-lines'
import { CARD } from './pointer-css'

const OPEN = 'Click to open'

const ARROW = String.fromCharCode(0x2192)

/** Props for {@link HoverCard}. */
export interface HoverCardProps {
  /** The card's own words, already split out of the attribute the mark carried. */
  readonly detail: Detail

  readonly left: number

  readonly top: number
}

const dateRange = (dates: string): string => dates.replace(' to ', ` ${ARROW} `)

/**
 * The short window a hover puts up: where the thing sits, what it is, three facts, and when it runs.
 *
 * ### Why the facts are a strip and not a list
 *
 * They were a `<dl>` of however many rows the mark had, which read as a form — six rows of two
 * columns in which the name a reader came for was the same weight as `Blocked by`. Three columns in
 * a tinted strip is a shape the eye takes in at once, and it is what makes the **title** the thing
 * the card is about rather than its first row. `detail-lines.ts` carries which three, and why an
 * item's third fact is its position where a feature's is what it waits on.
 *
 * It is still a `<dl>`: each fact is a term and its value, which is what a description list is for
 * and what keeps the pairing when a reader's own stylesheet drops the grid. The three-column layout
 * is `grid-flow-col`, so the pairs stay adjacent in the markup and are merely laid out sideways.
 *
 * `aria-hidden` all the same, for the reason `drag-ghost.tsx` is: it is a visual echo of facts
 * already in the accessibility tree, and the reading of them a screen reader gets is the table, which
 * gives each one a cell with a header.
 *
 * ### The footer, which promises something
 *
 * `Click to open` is the one line here that is not a fact about the plan, and it earns its place: a
 * bar is a link with `tabIndex={-1}` inside a `role="img"`, so nothing else on the board says that
 * pointing at a mark and clicking it opens the thing. The dates sit beside it in tabular figures, so
 * two cards stacked while a pointer moves do not jitter.
 *
 * Nothing here decides anything. The wording is `detail-lines.ts`'s — the table's own, so the two
 * renderings cannot disagree — the position is `pointer-view.ts`'s, and what to show is
 * `plan-pointer.tsx`'s. This is the markup, which is why it takes three plain values and holds no
 * state.
 */
export function HoverCard({ detail, left, top }: HoverCardProps) {
  return (
    <div aria-hidden="true" className={CARD.root} data-slot="hover-card" style={{ left, top }}>
      <div className={CARD.head}>
        {detail.context === '' ? null : (
          <p className={CARD.context}>
            {detail.colour === '' ? null : (
              <span className={CARD.dot} style={{ backgroundColor: detail.colour }} />
            )}
            {detail.context}
          </p>
        )}
        <p className={CARD.title} data-slot="hover-title">
          {detail.title}
        </p>
      </div>
      {detail.facts.length === 0 ? null : (
        <dl className={CARD.facts}>
          {detail.facts.map((fact) => (
            <div className={CARD.fact} key={fact.label}>
              <dt className={CARD.label}>{fact.label}</dt>
              <dd className={CARD.value}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={CARD.footer}>
        <span className={CARD.dates}>{dateRange(detail.dates)}</span>
        <span className={CARD.open}>{OPEN}</span>
      </p>
    </div>
  )
}
