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
  root: 'flex h-full min-h-0 flex-col bg-muted/30',
  head: 'shrink-0 border-b border-border bg-background px-4 py-3 max-sm:px-3',
  toolbar:
    'flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-2 max-sm:px-3',
  body: 'flex min-h-0 flex-1 max-lg:flex-col',
  side: 'flex w-[17.5rem] min-w-0 shrink-0 flex-col overflow-y-auto border-r border-border bg-background max-lg:h-52 max-lg:w-full max-lg:border-r-0 max-lg:border-b',
  main: 'flex min-h-0 min-w-0 flex-1 flex-col',
} as const

/**
 * The title row: a breadcrumb over the plan name, its calendar, and the actions that act on the
 * whole plan.
 *
 * Actions sit at the far end of the row rather than in the sidebar, where the first revision put
 * them. Sharing a plan and renaming a plan are not navigation, and putting them above the rail tree
 * meant the sidebar's own primary action — add a rail — competed with three things that have
 * nothing to do with rails.
 */
export const HEAD = {
  row: 'flex flex-wrap items-center gap-x-3 gap-y-2',
  crumbs: 'flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground',
  crumbLink: 'truncate hover:text-foreground hover:underline',
  title: 'truncate text-[18px] leading-tight font-semibold',
  meta: 'mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground',
  spacer: 'flex-1',
  actions: 'flex shrink-0 flex-wrap items-center gap-1.5',
} as const

/**
 * Buttons, in two weights and one size.
 *
 * One accent and otherwise hairlines and grey, which is the palette both reference tools use. The
 * page this replaces had a `rounded-lg` pill with a `ring-1` on every control and a `rounded-xl`
 * card behind every region, and the result read as a settings screen rather than a board.
 */
export const BUTTON = {
  primary:
    'inline-flex h-7 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[13px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
  quiet:
    'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[13px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
} as const
