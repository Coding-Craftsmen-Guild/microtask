/**
 * The timeline-or-table switch, as ids, whole class strings, and one rule the page carries.
 *
 * ### Why a radio and not state
 *
 * Both views are server-rendered from one read of the plan, and which one is on screen is a
 * preference with no consequence beyond the pixels. A checked radio and two CSS rules do that with
 * no client component, no hydration and no round trip — the argument ADR 0064 makes for group
 * selection, applied to the one other thing on this page that is pure presentation.
 *
 * ### Why `:has()` and not `peer-checked:`
 *
 * `peer-*` compiles to the CSS sibling combinator, so it can only reach an element that follows the
 * input **in the same parent**. The tabs belong in the toolbar strip and the panels are two regions
 * down the frame, and the first revision's switch only worked because every one of those things was
 * crammed into one flex row. Hoisting the condition to the shell with `:has()` lets each live where
 * it belongs, and is the same mechanism the group chips and the rail selection already use.
 *
 * The tab *labels* keep `peer-checked/`: a label and its input really are siblings, and that is a
 * cheaper rule than a second `:has()`.
 */
export const VIEW_SWITCH = {
  tabs: 'flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5',
  timelineId: 'plan-view-timeline',
  tableId: 'plan-view-table',
  hintId: 'plan-view-hint',
  timelineRadio: 'peer/timeline sr-only',
  tableRadio: 'peer/table sr-only',
  timelineTab:
    'cursor-pointer rounded-[5px] px-2.5 text-[12px] font-medium leading-6 text-muted-foreground hover:text-foreground peer-checked/timeline:bg-background peer-checked/timeline:text-foreground peer-checked/timeline:shadow-[0_1px_2px_rgba(0,0,0,.08)] peer-focus-visible/timeline:outline-2 peer-focus-visible/timeline:outline-brand',
  tableTab:
    'cursor-pointer rounded-[5px] px-2.5 text-[12px] font-medium leading-6 text-muted-foreground hover:text-foreground peer-checked/table:bg-background peer-checked/table:text-foreground peer-checked/table:shadow-[0_1px_2px_rgba(0,0,0,.08)] peer-focus-visible/table:outline-2 peer-focus-visible/table:outline-brand',
  timelinePanel: 'flex min-h-0 flex-1 flex-col',
  tablePanel: 'min-h-0 flex-1 overflow-auto',
} as const

const SHELL = '[data-slot="plan-shell"]'

const CHECKED = '#plan-view-table:checked'

const TIMELINE = '[data-slot="timeline-panel"]'

const TABLE = '[data-slot="table-panel"]'

const OFF_SCREEN =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0'

/**
 * The two rules that put whichever view is not chosen out of the way.
 *
 * ### The two are not treated alike, on purpose
 *
 * The unchosen **timeline** is `display:none`. It is an `<svg role="img">` with a label and nothing
 * else inside it that a screen reader can use, so removing it costs a reader one alt text.
 *
 * The unchosen **table** is taken off screen instead, with the declarations `sr-only` compiles to.
 * The table is the accessible rendering of this plan — every feature, every item, every date, as
 * rows — and the canvas is not. Hiding it outright would mean that a reader who cannot see the
 * timeline has to find and operate a view switch before the plan exists for them at all. Off screen
 * it stays in the accessibility tree whichever view is chosen, and that is the property worth
 * keeping: it was true of the first revision, and it is the one thing about that switch that was
 * right.
 *
 * Static, unlike the group and selection sheets, because there are exactly two views and neither is
 * named after anything in the plan. It is a `<style>` rather than a utility because there is no
 * utility for "an ancestor of me contains a checked input", which is the whole condition.
 *
 * Written so the timeline shows when neither rule matches: a page whose style element failed to
 * load, or whose radios never rendered, shows the plan rather than nothing.
 *
 * The off-screen declarations are what `sr-only` compiles to, written out because a `:has()` rule
 * cannot apply a utility class.
 */
export const VIEW_SWITCH_CSS = `${SHELL}:has(${CHECKED}) ${TIMELINE}{display:none}${SHELL}:not(:has(${CHECKED})) ${TABLE}{${OFF_SCREEN}}`
