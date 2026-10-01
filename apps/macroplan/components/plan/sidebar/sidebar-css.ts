/**
 * The rail tree's rows.
 *
 * ### `min-w-0` on every row and every name
 *
 * This is the whole fix for the sidebar that overflowed onto the canvas. A flex item's default
 * minimum size is its content, so `flex-1 truncate` — which is what the first revision used — never
 * truncated anything: the item refused to shrink below the width of the name inside it and grew the
 * row instead. `min-w-0` opts out of that, and it has to be on **both** the row and the growing
 * child, because each is a flex item in turn.
 *
 * ### Why the disclosure is a checkbox and not a `<details>`
 *
 * A rail row holds a link and a label for a radio. Inside a `<summary>` a click on either of those
 * toggles the disclosure as well as doing what it was aimed at, because activation is the summary's and
 * the click reaches it by bubbling — so opening a rail's drawer would collapse the rail on the way.
 *
 * A hidden checkbox has no such behaviour, and what it hides is {@link TREE_CSS}.
 *
 * ### Why the features need a wrapper
 *
 * The rule has to hide something, and it cannot be the rows: each row's own selection radio has to stay
 * its DOM sibling for `peer-checked:` to reach it. So the features sit in their own grid, which is one
 * more element and the only structural cost of the whole disclosure.
 *
 * ### Why the swatch is a label and the name is a link
 *
 * Two gestures share a row: highlight this on the board, and open this for editing. Wrapping the
 * whole row in a label would swallow the link; putting a second button beside the name is what
 * produced the `Open` links that escaped the column. The colour chip is the highlight control, and
 * it doubles as the thing the eye uses to match a row to its band.
 */
export const TREE = {
  root: 'grid gap-px px-1.5 pb-2',
  branch: 'grid gap-px',
  toggle: 'sr-only',
  kids: 'grid gap-px',
  caret:
    'flex size-4 shrink-0 cursor-pointer items-center justify-center text-[9px] text-muted-foreground transition-transform hover:text-foreground',
  railRow:
    'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted peer-checked:bg-brand-soft',
  featureRow:
    'flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-1.5 pl-6 hover:bg-muted peer-checked:bg-brand-soft',
  grip: 'flex size-4 shrink-0 cursor-pointer items-center justify-center',
  swatch: 'size-2.5 rounded-[3px] bg-muted-foreground',
  railName: 'min-w-0 flex-1 truncate text-[13px] font-medium hover:underline',
  railStatic: 'min-w-0 flex-1 truncate text-[13px] font-medium',
  featureName: 'min-w-0 flex-1 truncate text-[13px] text-muted-foreground hover:text-foreground hover:underline',
  empty: 'px-1.5 py-1 pl-6 text-[12px] text-muted-foreground',
} as const

const BRANCH = '[data-slot="rail-branch"]'

const CLOSED = '[data-slot="rail-toggle"]:checked'

/**
 * What a collapsed rail looks like: its features gone, and its caret turned.
 *
 * ### Why a sheet and not two `peer-checked/open:` utilities
 *
 * The caret is **inside** the rail's row and the features are in a wrapper **beside** it, so no one
 * element is a sibling of both. `peer-*` compiles to the sibling combinator, which is exactly the limit
 * `view-switch.ts` ran into and answered the same way: `:has()` on a common ancestor asks the question
 * from the branch, and reaches down either side of it.
 *
 * A second unnamed `peer` in the branch would also have been a hazard worth avoiding on its own.
 * `peer-checked:` compiles to `.peer:checked ~ &`, which matches **any** preceding sibling carrying
 * `peer` — so a disclosure checkbox wearing that class would tint every row on its rail the moment it
 * was collapsed, as though the rail had been selected.
 *
 * Two rules whatever the plan holds, because they name slots and no ids. Checked means **closed**, so a
 * plan with nothing clicked draws fully expanded and carries no state anywhere.
 */
export const TREE_CSS = [
  `${BRANCH}:has(> ${CLOSED}) [data-slot="rail-kids"]{display:none}`,
  `${BRANCH}:has(> ${CLOSED}) [data-slot="rail-caret"]{transform:rotate(-90deg)}`,
].join('')

/**
 * The sidebar's own chrome: a sticky head holding the heading, the actions and the filter, over a
 * tree that scrolls under it.
 *
 * The actions moved out of here in this revision — sharing and renaming a plan are not navigation —
 * except the one that belongs: adding a rail is the tree's own primary action, and it sits at the
 * top of the tree it adds to.
 */
export const SIDE = {
  head: 'sticky top-0 z-10 grid gap-2 border-b border-border bg-background px-3 py-2.5',
  headRow: 'flex items-center gap-2',
  heading: 'flex-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
  search:
    'w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-brand',
  none: 'px-3 py-2 text-[13px] text-muted-foreground',
} as const
