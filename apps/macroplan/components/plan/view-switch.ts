/**
 * The ids and class names the plan screen's two-radio view switch is built out of.
 *
 * A module of constants and **deliberately not a component.** `PlanScreen` argues it at length: a
 * `peer-*` variant is a sibling selector, so the two radios, their labels and both panels have to be
 * siblings under one flex parent, and any wrapper drawn around the radios breaks the only connection
 * that makes the switch work without JavaScript. That rules out extracting the markup and leaves the
 * strings, which is what this file is. There is nothing here to render and there cannot be.
 *
 * One record rather than ten exported constants, for the reason `canvas/view.ts`' `LAYOUT` is one: it
 * is one decision — how the switch is wired and painted — and the parts are coupled. The `peer/timeline`
 * and `peer/table` names in `timelineRadio` and `tableRadio` are what `timelineTab`, `tableTab`,
 * `scroller` and `tablePanel` select on, so a name changed in one of them and not the others is a
 * switch that silently stops switching; and `timelineId`, `tableId` and `hintId` are the same wiring
 * seen from the markup's side, tying each label to its input and both inputs to the one sentence that
 * says what the choice does.
 *
 * Every value is a whole string literal, because Tailwind's scanner reads source as plain text and
 * emits no CSS for a class name it cannot see in one piece. `module-boundaries.test.tsx` walks this
 * directory and would fail on a composed one.
 */
export const VIEW_SWITCH = {
  views: 'flex flex-wrap items-center gap-x-2 gap-y-4',
  timelineId: 'plan-view-timeline',
  tableId: 'plan-view-table',
  hintId: 'plan-view-hint',
  timelineRadio: 'peer/timeline sr-only',
  tableRadio: 'peer/table sr-only',
  timelineTab:
    'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-foreground/10 peer-checked/timeline:bg-card peer-checked/timeline:text-foreground peer-focus-visible/timeline:ring-2 peer-focus-visible/timeline:ring-brand',
  tableTab:
    'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-foreground/10 peer-checked/table:bg-card peer-checked/table:text-foreground peer-focus-visible/table:ring-2 peer-focus-visible/table:ring-brand',
  scroller:
    'w-full overflow-x-auto rounded-xl bg-card p-3 ring-1 ring-foreground/10 peer-checked/table:hidden',
  tablePanel:
    'w-full rounded-xl bg-card p-3 ring-1 ring-foreground/10 peer-checked/timeline:sr-only',
} as const
