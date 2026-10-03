/**
 * The timeline-or-table switch, as ids and whole class strings.
 *
 * ### Why it is state now, and still a radio
 *
 * Both views used to be server-rendered on every request, the unchosen one hidden by a `:has()` rule, so
 * that switching asked the server nothing. The plan screen renders in the browser now (ADR 0069), so the
 * choice is React state and the unchosen view is simply not drawn — the canvas, at least: the table is
 * still mounted off screen for assistive tech (`./plan-views.tsx`). The control is still two radios and
 * two labels, because that is what it is to a screen reader, and the labels still style themselves with
 * `peer-checked/` off the input they sit beside.
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
  tablePanel: 'flex min-h-0 min-w-0 flex-1 flex-col',
} as const

/** Which rendering of the plan is on screen. */
export type PlanView = 'timeline' | 'table'
