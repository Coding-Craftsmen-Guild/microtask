/** The attribute the filter sets on everything that does not match what was typed. */
export const FADED = 'data-faded'

const RAIL_ROW = '[data-slot="rail-row"]'

const FEATURE = '[data-slot="feature-group"]'

/**
 * What the filter asks about, as one selector: a rail's row, and a feature's marks.
 *
 * Both carry `data-search` — a name the server already lowered — so one query answers both and the
 * component walking them has no opinion about which is which. A feature's `<g>` holds its bar and
 * every item tick under it, so fading the group fades the whole of a feature in one attribute rather
 * than one per mark.
 */
export const SEARCHABLE = `${RAIL_ROW},${FEATURE}`

/**
 * How faint an unmatched rail or feature goes: the same third the group chips and the rail selection
 * quiet to.
 *
 * One number for all three, because they are one idea — *this is the part you asked about, and here
 * is the rest of the plan, still legible behind it*. Three different weights of faint would read as
 * three different states.
 */
export const FADED_OPACITY = '0.32'

/**
 * The one rule the filter paints with, as a static sheet.
 *
 * A sheet rather than a Tailwind class for the reason `canvas/pointer-css.ts` sets `data-lit` and
 * paints it this way: the elements are the server's, an attribute toggled on them costs nothing, and
 * the rule names slots and no ids so there is nothing in it that depends on the plan. A class would
 * have to be a literal Tailwind can see, and toggling one imperatively on a `<g>` the server drew
 * would be a second spelling of "not matched" beside the attribute.
 *
 * A **transition** is on it because this is the one dimming on the page that changes on every
 * keystroke; the other two change on a click. Without it a reader typing four letters watches the
 * plan flash four times.
 */
export const FILTER_CSS =
  `[${FADED}]{opacity:${FADED_OPACITY};transition:opacity .12s}`
