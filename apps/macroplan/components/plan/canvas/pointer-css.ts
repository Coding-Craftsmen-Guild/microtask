/**
 * The slots a hover lights, which is every part of one feature's thread.
 *
 * A bar, the item ticks under it, and the arcs leaving and arriving. Pointing at any one of them
 * lights all of them, which is what makes a hover answer "what does this wait on, and what waits on
 * it" without a click and without a second view.
 *
 * There were five. The name on the bar went when the canvas stopped drawing text, and **the row in
 * the rail tree** went with the tree: a row there was a feature, so it carried a `data-hover-id` and
 * lit with its bar. The column that replaced it (`../board/rail-column.tsx`) is one row per **rail**,
 * and a rail is not a feature's thread — lighting a lane because the pointer is on one bar in it
 * would say something the plan does not mean. Nothing is lost that the card does not say better: it
 * is now the only thing a hover produces that carries words, which is part of why it matters more
 * than it did.
 */
export const LIT_SLOTS: readonly string[] = ['feature-bar', 'item-mark', 'arc']

const lit = (slot: string): string => `[data-slot="${slot}"][data-lit]`

const SHAPES = ['feature-bar', 'item-mark', 'arc'].map(lit).join(',')

/**
 * What lighting looks like, as one static sheet.
 *
 * ### Why an attribute and not a generated rule per feature
 *
 * CSS can ask "is an element with this id hovered" from a common ancestor — `:has()` is how the group
 * chips and the rail selection reach across subtrees — but only with **one rule per feature**, and the
 * selection sheet already writes two of those per feature. A third would be three hundred rules on a
 * plan of a hundred features, generated on every render, to paint something that lasts as long as a
 * pointer rests on it.
 *
 * So `plan-pointer.tsx` sets `data-lit` on the handful of elements that share the hovered feature's
 * `data-hover-id`, and this paints them. It is the same move `sidebar/sidebar-search.tsx` makes when it
 * sets `hidden` on a row rather than generating a sheet: an attribute toggled on five elements costs
 * nothing and does not scale with the plan.
 *
 * ### Why it brightens rather than dims
 *
 * Dimming is the selection gesture's own language — a group chip, a chosen rail and the board's own
 * filter all quiet everything else. A hover that also dimmed would make a pointer crossing the board
 * look like a click that had already happened, and there would be no way to tell a chosen thread from
 * one the pointer is merely passing over.
 *
 * `opacity:1` is deliberate and is the one declaration that overrides something: a feature outside the
 * chosen group is dimmed to 0.32, and pointing at it should still show it. A reader asking "what is
 * that faint bar" gets an answer rather than a fainter version of the question.
 *
 * ### Why the sheet is static
 *
 * It names slots and no ids, so there is nothing in it that depends on the plan. It is a module
 * constant beside `view-switch.ts`'s, rather than a generated string beside the group and selection
 * sheets, and it is mounted once by `PlanScreen`.
 */
export const POINTER_CSS = `${SHAPES}{opacity:1;stroke-width:2.5px}`

/**
 * The hover card itself, as whole class strings.
 *
 * `fixed` and `pointer-events-none`, which together are the whole of why a card cannot interfere with
 * what it describes: it is laid out against the viewport wherever it sits in the tree, so no ancestor's
 * `overflow` clips it, and a pointer passes straight through it — a card that caught the pointer would
 * put itself between the pointer and the bar and then immediately close.
 *
 * `aria-hidden` goes on it in the component for the reason the drag ghost carries one: it is a visual
 * echo of something already in the accessibility tree, and the keyboard path to the same facts is the
 * table, which names every one of them in a cell.
 *
 * ### Why the title wraps
 *
 * It was `truncate`, which cost little while every bar carried its own name and costs a great deal
 * now that none does: this is the only place on the board where a feature or an item is named in
 * full. A card put up to say what something is, cutting off what it is, would make the gesture that
 * replaced the labels worse than the labels were. `max-w-80` is what stops it growing without bound,
 * and `break-words` is what keeps an unspaced id from pushing past that.
 */
export const CARD = {
  root: 'pointer-events-none fixed z-50 max-w-80 rounded-md border border-border bg-background px-3 py-2 text-[12px] shadow-lg',
  title: 'mb-1 break-words text-[13px] font-semibold text-foreground',
  rows: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5',
  label: 'text-muted-foreground',
  value: 'text-foreground',
} as const
