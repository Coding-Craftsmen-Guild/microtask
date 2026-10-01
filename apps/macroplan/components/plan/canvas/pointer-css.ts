/**
 * The slots a hover lights, which is every part of one feature's thread.
 *
 * A bar, the name on it, the item ticks under it, the arcs leaving and arriving, and the row in the
 * tree. Pointing at any one of them lights all of them, which is what makes "hover a feature in the
 * sidebar and watch the timeline" and "hover a bar" the same gesture rather than two features.
 */
export const LIT_SLOTS: readonly string[] = [
  'feature-bar',
  'bar-label',
  'item-mark',
  'arc',
  'sidebar-row',
]

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
 * Dimming is the selection gesture's own language — a group chip, a rail, a feature in the tree all
 * quiet everything else. A hover that also dimmed would make a pointer crossing the sidebar look like a
 * click that had already happened, and there would be no way to tell a chosen thread from one the
 * pointer is merely passing over.
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
export const POINTER_CSS = [
  `${SHAPES}{opacity:1;stroke-width:2.5px}`,
  `${lit('bar-label')}{opacity:1;font-weight:650}`,
  `${lit('sidebar-row')}{background-color:var(--color-brand-soft)}`,
].join('')

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
 */
export const CARD = {
  root: 'pointer-events-none fixed z-50 max-w-80 rounded-md border border-border bg-background px-3 py-2 text-[12px] shadow-lg',
  title: 'mb-1 truncate text-[13px] font-semibold text-foreground',
  rows: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5',
  label: 'text-muted-foreground',
  value: 'text-foreground',
} as const
