import { dayToDate } from '@repo/schedule'
import type { PlanScreenModel } from '../plan-screen-model'
import { memoOnPlan } from '../store/memo-on-plan'
import { tableRows, type TableRow } from '../table/rows'

/** One labelled fact in a card's strip. */
export interface DetailLine {
  readonly label: string

  readonly value: string
}

/**
 * What a hover over one mark says: where it sits, what it is, three facts, and when it runs.
 *
 * ### Why the shape is fixed and the lines are not a list any more
 *
 * It was a title and however many `label`/`value` lines the row had, stacked. That reads as a form:
 * six rows of two columns, in which the one thing a reader came for — the name — is the same weight
 * as `Blocked by`. The card has a shape now because the facts have a hierarchy: the context says
 * *where*, the title says *what*, three facts answer the three questions a mark cannot show, and the
 * dates close it. Three is a number and not a maximum: a strip of three columns is a strip a reader
 * takes in at once, and a fourth would make it a table again.
 */
export interface Detail {
  /** The line over the title: a feature's group and rail, or the feature an item is in. */
  readonly context: string

  /** The thing's own name, which is the card's heading. */
  readonly title: string

  /** When it runs, as two real calendar dates, or `''` for a mark with no span. */
  readonly dates: string

  /** The hue of its dot, which is its group's colour or its rail's — `hueOf`'s own rule. */
  readonly colour: string

  /** The three facts in the strip, each a micro-label over a value. */
  readonly facts: readonly DetailLine[]
}

/**
 * What each line of a card is called.
 *
 * A record rather than literals at the point of use, for the reason `board-words.ts` is one: a test
 * that asserts the wording and the code that writes it have to be reading the same string, or the test
 * is pinning its own copy of it.
 */
export const DETAIL_WORDS = {
  estimate: 'Estimate',
  sprint: 'Sprint',
  waits: 'Waits for',
  position: 'Position',
  nothing: 'Nothing',
  itemOf: 'Item of',
} as const

const BETWEEN_LINES = String.fromCharCode(10)

const BETWEEN_PARTS = String.fromCharCode(9)

const SEPARATORS = new RegExp(`[${BETWEEN_PARTS}${BETWEEN_LINES}]+`, 'g')

const flat = (value: string): string => value.replace(SEPARATORS, ' ')

const HEAD = 4

const EMPTY: Detail = { context: '', title: '', dates: '', colour: '', facts: [] }

/**
 * One card as a single attribute value: four fixed lines, then one `label`-`value` line per fact.
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
    flat(detail.context),
    flat(detail.title),
    flat(detail.dates),
    flat(detail.colour),
    ...detail.facts.map((line) => `${flat(line.label)}${BETWEEN_PARTS}${flat(line.value)}`),
  ].join(BETWEEN_LINES)

/**
 * {@link joinDetail} read back, as the hover root reads it off a mark.
 *
 * An empty string answers an empty card rather than a card titled nothing, so a mark carrying no detail
 * — or carrying an attribute that was never written — draws no card at all. The four head lines are
 * positional and the rest are facts, which is why the head is a constant rather than a count: a card
 * that lost a line would otherwise read its first fact as its dates.
 */
export function splitDetail(text: string): Detail {
  if (text === '') return EMPTY
  const lines = text.split(BETWEEN_LINES)
  const [context = '', title = '', dates = '', colour = ''] = lines
  return {
    context,
    title,
    dates,
    colour,
    facts: lines.slice(HEAD).map((line) => {
      const [label = '', value = ''] = line.split(BETWEEN_PARTS)
      return { label, value }
    }),
  }
}

interface Lookups {
  readonly plan: PlanScreenModel
  readonly spans: ReadonlyMap<string, { readonly startDay: number; readonly endDay: number }>
  readonly places: ReadonlyMap<string, string>
  readonly labelHues: ReadonlyMap<string, string>
  readonly railHues: ReadonlyMap<string, string>
}

const placesOf = (plan: PlanScreenModel): ReadonlyMap<string, string> => {
  const counts = new Map<string, number>()
  const at = new Map<string, number>()
  for (const item of plan.items) {
    const before = counts.get(item.featureId) ?? 0
    at.set(item.id, before)
    counts.set(item.featureId, before + 1)
  }
  return new Map(
    plan.items.map((item) => [item.id, `${String((at.get(item.id) ?? 0) + 1)} of ${String(counts.get(item.featureId) ?? 0)}`]),
  )
}

const lookupsOf = (plan: PlanScreenModel): Lookups => ({
  plan,
  spans: new Map(plan.schedule.spans.map((span) => [span.id, span])),
  places: placesOf(plan),
  labelHues: new Map(plan.labels.map((label) => [label.id, label.colour])),
  railHues: new Map(plan.epics.map((epic) => [epic.id, epic.colour])),
})

const datesOf = (id: string, lookups: Lookups): string => {
  const span = lookups.spans.get(id)
  if (span === undefined) return ''
  const last = Math.max(span.startDay, span.endDay - 1)
  return `${dayToDate(span.startDay, lookups.plan)} to ${dayToDate(last, lookups.plan)}`
}

const waitsFor = (row: TableRow): string => {
  const count = row.blockedBy.length
  if (count === 0) return DETAIL_WORDS.nothing
  return count === 1 ? '1 feature' : `${String(count)} features`
}

const hueFor = (row: TableRow, lookups: Lookups): string =>
  lookups.labelHues.get(row.labelId ?? '') ?? lookups.railHues.get(row.railId) ?? ''

const contextOf = (row: TableRow): string => {
  if (row.item !== null) return `${DETAIL_WORDS.itemOf} ${row.feature}`
  return row.group === null ? row.epic : `${row.group} · ${row.epic}`
}

const factsOf = (row: TableRow, lookups: Lookups): readonly DetailLine[] => [
  { label: DETAIL_WORDS.estimate, value: row.estimate },
  { label: DETAIL_WORDS.sprint, value: row.sprint },
  row.item === null
    ? { label: DETAIL_WORDS.waits, value: waitsFor(row) }
    : { label: DETAIL_WORDS.position, value: lookups.places.get(row.id) ?? '' },
]

const detailOf = (row: TableRow, lookups: Lookups): Detail => ({
  context: contextOf(row),
  title: row.item ?? row.feature,
  dates: datesOf(row.id, lookups),
  colour: hueFor(row, lookups),
  facts: factsOf(row, lookups),
})

/**
 * One joined card per feature and per item, keyed on the id the mark that draws it carries.
 *
 * ### The wording is the table's, and is not decided a second time
 *
 * The estimate and the sprint come straight off the `TableRow` the table renders. That is the point:
 * `table/rows.ts` is where §3.2's estimate wording and the sprint label are settled, and ADR 0056 is the
 * argument that the two renderings of a plan must not word it differently. A card that said `5 days`
 * where the table said `5d` would be a third opinion about a plan the forward pass has already answered.
 *
 * `tableRows` is memoised on the plan object, and so is this (`../store/memo-on-plan.ts`), and both are
 * handed the one object the plan store holds. So a screen that draws the canvas and the table derives the
 * rows once and joins them once per change of the plan, and a hover, a zoom or a drawer derives nothing.
 *
 * ### Why the lookups are maps
 *
 * Each card used to find its span by scanning every span, and an item's place by filtering every item —
 * once per row, so quadratic in the plan. At this product's cap that was the single most expensive thing
 * the server did to draw a page, some 400 ms of every render. The spans, the places and the hues are read
 * into maps once, so the whole join is linear.
 *
 * ### What the third fact is, and why it differs by kind
 *
 * A feature's is **Waits for**, counted rather than named: a card is 300px wide and a list of four
 * dependency names is a paragraph. The names are in the table's own column and in the drawer, which is
 * where somebody acting on them is going anyway. An item's is **Position**, `2 of 4`, which is the one
 * thing an item bar's place in a row does not say — bars are laid out back to back, so the third of four
 * and the third of ten look identical.
 *
 * ### What is deliberately not on a card
 *
 * **Progress.** A counted percentage belongs to a linked task and arrives from the bridge, which is a
 * second read; threading it here would make the card say more on one surface than another for the same
 * mark. The mark's own treatment already says started or done, and the table's progress column is where
 * the number is.
 *
 * **A rail.** The map is keyed by feature and item ids only. A rail has a name, a colour and a band, and
 * nothing a one-line card would add to what the column beside it already says.
 *
 * ### The dates, which the table has no column for
 *
 * §5's "real calendar dates", read off the span and never off the sprint label. `endDay` is exclusive
 * everywhere in this codebase and a reader is not interested in the day after the work, so the second
 * date is `endDay - 1` — the same inclusive last day `sprintOfRow` takes, and the same closed range the
 * sprint hover already words with the word `to` rather than a dash.
 *
 * A row with no span contributes no dates at all. There is no sentence to write there that the sprint
 * fact does not already write better: it says `not placed · no estimate`, which is both the fact and the
 * reason.
 */
export const detailsOf = memoOnPlan((plan: PlanScreenModel): ReadonlyMap<string, string> => {
  const lookups = lookupsOf(plan)
  return new Map(tableRows(plan).map((row) => [row.id, joinDetail(detailOf(row, lookups))]))
})
