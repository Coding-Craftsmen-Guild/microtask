import type { SubjectKind } from './values'

const MIDDOT = String.fromCharCode(0xb7)

/**
 * The id the fields row's own hint carries, so a field can name it as its description.
 *
 * One sentence under the row rather than one under each field, and that is a layout fact as much as an
 * editorial one: the fields are a wrapping flex row of 34px controls, and a paragraph inside any one of
 * their cells would stretch that cell to the width of the paragraph. So the rule lives under the row and
 * the fields point at it — which is also how a reader would read it, the sentence being about how the
 * schedule treats all three.
 */
export const FIELDS_HINT_ID = 'plan-drawer-fields-hint'

/** The sentence under the fields, which is the rule a reader cannot deduce from the controls. */
export const PANEL_HINTS: Readonly<Record<SubjectKind, string>> = {
  feature:
    'Estimates are days in halves, and 0 is a milestone that takes no time. Sprint is placed by the schedule unless pinned: a pin is a floor, so it can only delay a feature, never move it earlier.',
  item: 'Days of work, in halves: 0.5, 1, 1.5. Items run one after another inside their feature, so changing an estimate moves the items that follow it.',
}

/** What the two columns of a feature's panel are called. */
export const PANEL_BANDS = {
  waits: 'Waits for',
  waitsSub: 'starts after these finish',
  unblocks: 'Unblocks',
  unblocksSub: 'these start after this finishes',
  noWaits: 'Nothing. It can start as soon as its rail is free.',
  noUnblocks: 'Nothing waits for this yet.',
  items: 'Items',
  noItems: 'No items yet. One item is how a feature gets a size of its own.',
  order: 'Order in feature',
  after: 'Comes after',
  before: 'Comes before',
  start: 'Start of feature',
  end: 'End of feature',
  earlier: 'Move earlier',
  later: 'Move later',
} as const

/** The meta line over the name: where this subject sits, and the days it occupies. */
export const metaLine = (context: string, dates: string): string =>
  dates === '' ? context : `${context} ${MIDDOT} ${dates}`

/**
 * How many items a feature holds and what they add up to, as the items column's sub-line.
 *
 * @param count - How many items there are.
 * @param days - What their estimates total, `null` where none of them is sized.
 * @returns A sentence, or `''` for a feature with no items at all.
 */
export const itemsLine = (count: number, days: number | null): string => {
  if (count === 0) return ''
  const total = days === null ? 'none sized' : `${String(days)}d total`
  return `${String(count)} ${MIDDOT} ${total}`
}

/**
 * The schedule's reading of an estimate, where it is not simply the number in the field.
 *
 * The row's Estimate cell is the schedule's verdict and the field is the authored number, and they
 * disagree in exactly the cases that matter: a feature broken down by its items reads
 * `planned 40d · broken down to 5d · -35d`, and a feature with no estimate of its own reads the
 * total of its items while the field is empty (ADR 0051). Where the two say the same thing, this
 * answers nothing, because a panel that printed `2d` under a stepper showing `2` would be charging a
 * line of the column for a fact already on screen.
 *
 * @param reading - The row's Estimate cell, as `table/rows.ts` worded it.
 * @param authored - The field's own value: days, `0` for a milestone, `null` for nothing sized.
 * @returns The reading to print, or `''` where the field already says it.
 */
export const scheduleReading = (reading: string, authored: number | null): string =>
  reading === `${String(authored ?? '')}d` ? '' : reading
