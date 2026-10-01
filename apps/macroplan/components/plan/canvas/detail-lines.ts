import { dayToDate } from '@repo/schedule'
import { cache } from 'react'
import type { PlanScreenModel } from '../plan-screen-model'
import { tableRows, type TableRow } from '../table/rows'

/** One labelled fact on a hover card. */
export interface DetailLine {
  readonly label: string

  readonly value: string
}

/** What a hover over one mark says: what it is, then a few facts about it. */
export interface Detail {
  /** The thing's own name, which is the card's heading. */
  readonly title: string

  readonly lines: readonly DetailLine[]
}

/**
 * What each line of a card is called.
 *
 * A record rather than literals at the point of use, for the reason `sidebar-words.ts` is one: a test
 * that asserts the wording and the code that writes it have to be reading the same string, or the test
 * is pinning its own copy of it.
 */
export const DETAIL_WORDS = {
  rail: 'Rail',
  feature: 'Feature',
  group: 'Group',
  estimate: 'Estimate',
  sprint: 'Sprint',
  dates: 'Dates',
  blocked: 'Blocked by',
} as const

const BETWEEN_LINES = String.fromCharCode(10)

const BETWEEN_PARTS = String.fromCharCode(9)

const SEPARATORS = new RegExp(`[${BETWEEN_PARTS}${BETWEEN_LINES}]+`, 'g')

const flat = (value: string): string => value.replace(SEPARATORS, ' ')

/**
 * One card as a single attribute value: the title, then one `label`-`value` line each.
 *
 * A tab and a newline, which is the pair `labels/member-rows.ts` already joins a list with, and they are
 * written as character codes for that module's own reason — a heredoc or an editor is free to rewrite an
 * escape, and these two have to survive being read back by {@link splitDetail} exactly.
 *
 * A separator appearing **inside** a value is folded to a space rather than escaped. A name holding a
 * tab is not a thing the API accepts, so the branch is unreachable in practice; what matters is which
 * way it fails if it ever is reached. Folding loses one odd character from one name. Escaping would need
 * an unescaper, and getting that wrong shifts every line after it onto the wrong label — a card that
 * confidently names the wrong rail, which is worse than a card with a space in a name.
 */
export const joinDetail = (detail: Detail): string =>
  [
    flat(detail.title),
    ...detail.lines.map((line) => `${flat(line.label)}${BETWEEN_PARTS}${flat(line.value)}`),
  ].join(BETWEEN_LINES)

/**
 * {@link joinDetail} read back, as the hover root reads it off a mark.
 *
 * An empty string answers an empty card rather than a card titled nothing, so a mark carrying no detail
 * — or carrying an attribute that was never written — draws no card at all.
 */
export function splitDetail(text: string): Detail {
  if (text === '') return { title: '', lines: [] }
  const [title = '', ...rest] = text.split(BETWEEN_LINES)
  return {
    title,
    lines: rest.map((line) => {
      const [label = '', value = ''] = line.split(BETWEEN_PARTS)
      return { label, value }
    }),
  }
}

const datesOf = (id: string, plan: PlanScreenModel): string | null => {
  const span = plan.schedule.spans.find((one) => one.id === id)
  if (span === undefined) return null
  const last = Math.max(span.startDay, span.endDay - 1)
  return `${dayToDate(span.startDay, plan)} to ${dayToDate(last, plan)}`
}

const lineIf = (label: string, value: string | null): readonly DetailLine[] =>
  value === null || value === '' ? [] : [{ label, value }]

const detailOf = (row: TableRow, plan: PlanScreenModel): Detail => ({
  title: row.item ?? row.feature,
  lines: [
    ...(row.item === null ? [] : lineIf(DETAIL_WORDS.feature, row.feature)),
    { label: DETAIL_WORDS.rail, value: row.epic },
    ...lineIf(DETAIL_WORDS.group, row.group),
    { label: DETAIL_WORDS.estimate, value: row.estimate },
    { label: DETAIL_WORDS.sprint, value: row.sprint },
    ...lineIf(DETAIL_WORDS.dates, datesOf(row.id, plan)),
    ...lineIf(DETAIL_WORDS.blocked, row.blockedBy.map((edge) => edge.name).join(', ')),
  ],
})

/**
 * One joined card per feature and per item, keyed on the id the mark that draws it carries.
 *
 * ### The wording is the table's, and is not decided a second time
 *
 * Every line but the dates comes straight off the `TableRow` the table renders. That is the point:
 * `table/rows.ts` is where §3.2's estimate wording and the sprint label are settled, and ADR 0056 is the
 * argument that the two renderings of a plan must not word it differently. A card that said `5 days`
 * where the table said `5d`, or that re-derived whether an edge was honoured, would be a third opinion
 * about a plan the forward pass has already answered — the mistake `rows.ts` names in its own note about
 * not re-deriving the order.
 *
 * `tableRows` is `cache()`d on the plan object, and so is this, and both are handed the same object by
 * `readPlan`. So a page that draws the canvas, the table and the sidebar derives the rows once and joins
 * them once.
 *
 * ### What is deliberately not on a card
 *
 * **Progress.** A counted percentage belongs to a linked task and arrives from the bridge, which is a
 * second read the sidebar is not given; threading it here would make the card say more on one surface
 * than another for the same mark. The mark's own treatment already says started or done, and the table's
 * progress column is where the number is.
 *
 * **A rail.** The map is keyed by feature and item ids only. A rail has a name, a colour and a band, and
 * nothing a one-line card would add to what the names column beside it already says.
 *
 * ### The dates, which the table has no column for
 *
 * §5's "real calendar dates", read off the span and never off the sprint label. `endDay` is exclusive
 * everywhere in this codebase and a reader is not interested in the day after the work, so the second
 * date is `endDay - 1` — the same inclusive last day `sprintOfRow` takes, and the same closed range the
 * sprint hover already words with the word `to` rather than a dash.
 *
 * A row with no span contributes no dates line at all. There is no sentence to write there that the
 * sprint line does not already write better: it says `not placed · no estimate`, which is both the fact
 * and the reason.
 */
export const detailsOf = cache((plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(tableRows(plan).map((row) => [row.id, joinDetail(detailOf(row, plan))])),
)
