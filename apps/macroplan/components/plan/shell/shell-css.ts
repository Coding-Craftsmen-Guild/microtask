/**
 * The `data-slot` of the one element every `:has()` rule on this page anchors on.
 *
 * ### Why it is a constant and not three string literals
 *
 * Three things have to name the same element: the shell that renders it, the group sheet
 * (`labels/group-css.ts`) and the selection sheet (`sidebar/select-css.ts`). They did not. Both
 * sheets named `plan-root`, which nothing has rendered since this frame replaced the old root with
 * `plan-shell` — so every rule in both sheets anchored on an element that did not exist, no rule
 * could match, and **neither selection dimmed anything in a browser**.
 *
 * Nothing failed. Each sheet's tests assert the rule's text, and the marks' tests assert the
 * attributes those rules name, and no test joined the two — which is exactly the shape of defect a
 * generated stylesheet invites, because a selector that matches nothing is valid CSS.
 * `plan-screen.test.tsx` now holds the join: the anchor must be an element the screen renders and an
 * ancestor of the marks the rules go on to select.
 */
export const PLAN_ROOT_SLOT = 'plan-shell'

/** {@link PLAN_ROOT_SLOT} as the attribute selector both generated sheets open their rules with. */
export const PLAN_ROOT = `[data-slot="${PLAN_ROOT_SLOT}"]`

/**
 * The plan page's frame, as whole class strings.
 *
 * ### Why a frame and not a stack
 *
 * The page this replaces was a vertical stack of cards in document flow: a heading, then a panel of
 * conflicts, then the drawer, then a grid holding the sidebar and the timeline. Everything competed
 * for the same axis, so the timeline — the thing the page is for — began 2780px down a 3150px page
 * and a reader met three screens of prose before they met the plan.
 *
 * A frame inverts that. The regions are fixed to the viewport and each scrolls on its own axis, so
 * the timeline is on screen at load however much else the plan holds, and growing the plan makes a
 * pane scroll rather than pushing the plan off the bottom. That is what Azure DevOps delivery plans
 * and GitHub Projects both do, and it is the difference between a page about a plan and a tool for
 * working on one.
 *
 * ### What the restyle took out of it
 *
 * Two regions became one. The head and the toolbar were separate strips, 3+2 rows of padding and two
 * borders between the plan's name and its first bar, and the division between them was not one a
 * reader could see a reason for — a view switch is as much part of "which plan am I looking at" as
 * the name above it. {@link HEAD} is the merged row.
 *
 * ### Why flex and not a two-column grid
 *
 * The previous split was `lg:grid-cols-[17rem_minmax(0,1fr)]`, and the seat surface passed no
 * sidebar. A null React child renders nothing at all rather than an empty box, so the timeline
 * became the *first* grid item and drew itself into the 17rem track — a 272px canvas on a 1545px
 * grid, with the wide column beside it empty. That is the single worst thing the deployed page was
 * doing, and it was invisible in every test because no test rendered the seat surface at width.
 *
 * Flex cannot fail that way. A missing sidebar is one fewer flex item and `flex-1` takes the room,
 * which is the right answer rather than a silently wrong one.
 *
 * ### `min-w-0` and `min-h-0`, everywhere
 *
 * A flex or grid item's default minimum is its content, not zero. An item that does not say
 * otherwise refuses to shrink below what is inside it and overflows its parent instead — which is
 * why the old sidebar's rows escaped their column and dropped `Open` links on top of the canvas,
 * and why `truncate` on a `flex-1` child never truncated anything. Every pane here opts out.
 */
export const SHELL = {
  root: 'flex h-full min-h-0 flex-col bg-background',
  head: 'shrink-0 border-b border-border bg-background',
  body: 'flex min-h-0 flex-1 max-lg:flex-col',
  side: 'flex w-[17.5rem] min-w-0 shrink-0 flex-col overflow-y-auto border-r border-border bg-background max-lg:h-52 max-lg:w-full max-lg:border-r-0 max-lg:border-b',
  main: 'flex min-h-0 min-w-0 flex-1 flex-col',
} as const

/**
 * The one row over the board: the plan's identity, what is on screen, and what acts on the whole of
 * it.
 *
 * ### Left to right, and why that order
 *
 * The name and its calendar, then the view switch, then everything else pushed to the far end. The
 * two halves answer different questions — *what am I looking at* and *how am I looking at it* — and
 * the gap between them is the spacer, so a reader's eye lands on the name first and finds every
 * control in one place at the other end. The first revision interleaved them across two rows and the
 * group chips were up beside the name, where they read as metadata about the plan rather than as a
 * filter over it.
 *
 * ### Why the breadcrumb is not here any more
 *
 * It is in the brand bar, which is where a breadcrumb goes and where this page now puts it
 * (`app/(admin)/plan-crumb.tsx`). A crumb above a 20px title that repeats it was the same word
 * twice, 14px apart.
 *
 * ### The divider
 *
 * One hairline, between the group chips and the zoom. Everything left of it changes *which work* is
 * emphasised and everything right of it changes *how much time* is on screen or acts on the plan,
 * and six controls in a row with no break reads as a toolbar nobody has grouped.
 */
export const HEAD = {
  row: 'flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 max-sm:px-3',
  identity: 'min-w-0',
  title: 'truncate text-[20px] leading-[1.15] font-[650]',
  meta: 'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground',
  views: 'ml-3 shrink-0 max-sm:ml-0',
  spacer: 'flex-1',
  controls: 'flex shrink-0 flex-wrap items-center gap-2',
  divider: 'h-[22px] w-px shrink-0 bg-border max-sm:hidden',
  actions: 'flex shrink-0 items-center gap-2',
} as const

/**
 * Buttons, in two weights and one height.
 *
 * One accent and otherwise hairlines and grey, which is the palette both reference tools use. The
 * page this replaces had a `rounded-lg` pill with a `ring-1` on every control and a `rounded-xl`
 * card behind every region, and the result read as a settings screen rather than a board.
 *
 * 28px, which is the height every other control in the head row now stands at — the segmented
 * switches, the chips and these. A row of controls at three heights is what made the first revision's
 * toolbar read as several toolbars.
 */
export const BUTTON = {
  primary:
    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
  quiet:
    'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-background px-3 text-[13px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
} as const

/**
 * A head-row button that opens a panel under itself, as whole class strings.
 *
 * ### Why a panel and not a drawer
 *
 * Settings and sharing were drawer routes, so changing a plan's sprint length meant covering the
 * plan with a 28rem panel and dimming the rest of the page behind a scrim — a modal interruption for
 * a three-field form. Neither is about anything *on* the board, so neither needs the board hidden to
 * be used, and both are short enough to sit under the button that opens them. ADR 0057's argument
 * for a route is about **selection** — a feature or an item, one of two thousand, worth linking to
 * and worth reloading — and a settings form is not a selection.
 *
 * ### `list-none` and the marker
 *
 * A `<summary>` draws a disclosure triangle by default, in two different places depending on the
 * browser. These are buttons, so the marker is removed outright — `list-none` for the modern
 * spelling and the `::-webkit-details-marker` rule in {@link MENU_CSS} for Safari's, which ignores it.
 *
 * The panel is positioned from the **right**, because these sit at the end of the row: anchored left
 * they would open off the edge of the page.
 */
export const MENU = {
  root: 'relative',
  openerPrimary:
    'inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
  openerQuiet:
    'inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line-strong bg-background px-3 text-[13px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
  panel:
    'absolute top-9 right-0 z-30 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-[10px] border border-border bg-background p-4 shadow-[0_12px_32px_rgba(46,36,86,.16),0_2px_6px_rgba(0,0,0,.06)]',
  body: 'grid gap-3',
} as const

const SUMMARY = 'summary'

/**
 * The one rule a `<details>` button needs that no utility spells: Safari's own disclosure marker.
 *
 * `list-style: none` is what every other engine reads and `::-webkit-details-marker` is what Safari
 * reads, and Tailwind has a utility for the first and not the second. Static, because it names an
 * element and nothing about a plan.
 */
export const MENU_CSS = `${SUMMARY}::-webkit-details-marker{display:none}`
