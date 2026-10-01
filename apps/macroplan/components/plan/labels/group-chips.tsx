import Link from 'next/link'
import { PLAN_DRAWERS } from '../../../lib/drawer-routes'
import { GroupChipRoot } from './group-chip-root'
import { ALL_RADIO_ID, GROUP_RADIO_NAME, groupCss, groupRadioId } from './group-css'
import type { GroupFit } from './group-fit'
import type { LabelRow } from './label-rows'

const CHIP =
  'cursor-pointer rounded-full border border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:text-foreground peer-checked:border-foreground peer-checked:text-foreground peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand'

const SWATCH = 'mr-1.5 inline-block size-2 rounded-full align-middle'

const ROW = 'flex flex-wrap items-center gap-1.5'

const NEW_CHIP =
  'cursor-pointer rounded-full border border-dashed border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand'

/** Props for {@link GroupChips}. */
export interface GroupChipsProps {
  /** Every group of the plan, with what each holds. Empty draws nothing at all. */
  readonly rows: readonly LabelRow[]

  /**
   * The plan these chips belong to, or `null` on a surface with no group drawer.
   *
   * `null` is the seat surface, which addresses features and items and nothing else
   * (`SEAT_DRAWER_ROUTES`). The chips stay what they have always been there — a way of looking at the
   * plan — with nothing to open and nothing to add. Null rather than a no-op, for the reason
   * `DrawerRoutes.rail` is null on that surface: a control that looks live and goes nowhere is worse
   * than no control.
   */
  readonly planId: string | null

  /** Whether this viewer may make a group, which decides the pill at the end of the row. */
  readonly mayAdd: boolean

  /**
   * Where the view goes when **All work** is chosen, which is the plan's own opening fit.
   *
   * A prop rather than something derived here, because this component is handed rows and not a plan —
   * and `allWorkFit` needs the schedule. `./group-fit.ts` carries why clearing a choice has to widen
   * the view again rather than leave a reader zoomed into a fortnight of a year's work.
   */
  readonly allFit: GroupFit
}

const fitAttributes = (fit: GroupFit | null): Record<string, string> =>
  fit === null ? {} : { 'data-fit-rung': fit.rung, 'data-fit-day': String(fit.day) }

/** What the chip that clears the choice says, and what an empty group's count reads as. */
export const GROUP_WORDS = {
  all: 'All work',
  none: 'empty',
  add: 'New group',
} as const

/**
 * What one chip says about how much is in its group, in words.
 *
 * Singular at one, because a group of one is the common case rather than an edge: a phase is started by
 * putting the first feature in it, so `1 features` would be on screen most of the time a group is new.
 *
 * Exported so this paragraph is allowed to exist — `local/tsdoc-comments-only` admits TSDoc on an
 * exported declaration and bans a line comment outright (ADR 0027).
 */
export const countOf = (row: LabelRow): string => {
  if (row.features === 0) return GROUP_WORDS.none
  return row.features === 1 ? '1 feature' : `${String(row.features)} features`
}

/**
 * One chip per group, and choosing one dims every feature that is not in it — on every rail at once.
 *
 * This is the whole of "select a group and they are all selected". A group cuts **across rails** by
 * design, so what selecting it has to do is pick out work that is deliberately not adjacent: two features
 * on two different rails, four rails apart, lit while everything between them goes quiet. Nothing else on
 * this screen can say that — a rail is one lane, a dependency is one edge, and a sprint is one column.
 *
 * ### No JavaScript, and a Server Component
 *
 * A radio group the browser owns, exactly as the view switch below it owns which rendering is on screen.
 * The radios are `sr-only` and each chip is their `<label>`, so a click on a chip checks the radio and the
 * `peer-checked` classes above restyle it — those are static class names, which is what lets Tailwind see
 * them. The dimming itself is the one thing no class can express, and `groupCss` argues at length why it is
 * a generated `<style>` rather than a class or an inline style.
 *
 * `All work` is first and checked, so the plan opens undimmed. It carries no rule of its own: with it
 * checked, no `:has()` in the sheet matches, and every bar is at full opacity because nothing said
 * otherwise.
 *
 * ### Why a chip also carries where the view should go
 *
 * Choosing a group fits the timeline to it — the stop that puts the whole group on screen, scrolled so
 * its first day is at the left edge. The decision is made on the server (`./group-fit.ts`) and written
 * onto the chip as two attributes, because the root that acts on it is a client component and a map of
 * groups is not something it may be handed (`../module-boundaries.test.tsx`).
 *
 * Selecting is untouched by any of it. The chip is still a `<label>` for a radio, the dimming is still
 * a generated rule, and `canvas/use-group-fit.ts` never calls `preventDefault` — so a click that moves
 * the view is the same click that checked the radio, in that order, and a browser with no JavaScript
 * still selects.
 *
 * A group with nothing placed carries neither attribute, and clicking it selects without moving. There
 * is no window to fit to, and sending a reader to day zero would look like the plan jumping.
 *
 * ### What a count is for
 *
 * A group with nothing in it says so. It is the state a reader most needs told, because choosing it dims
 * the **entire** plan — and without the words, an admin who has made "Phase 2" and not filled it yet reads
 * a blank timeline as a bug rather than as an empty phase.
 */
export function GroupChips({ rows, planId, mayAdd, allFit }: GroupChipsProps) {
  if (rows.length === 0) return null
  const chips = (
    <div className={ROW} data-slot="group-chips">
      <style>{groupCss(rows)}</style>
      <input className="sr-only peer" defaultChecked id={ALL_RADIO_ID} name={GROUP_RADIO_NAME} type="radio" />
      <label className={CHIP} htmlFor={ALL_RADIO_ID} {...fitAttributes(allFit)}>
        {GROUP_WORDS.all}
      </label>
      {rows.map((row) => (
        <span className="contents" key={row.id}>
          <input
            className="sr-only peer"
            id={groupRadioId(row.id)}
            name={GROUP_RADIO_NAME}
            type="radio"
          />
          <label
            className={CHIP}
            data-label-id={row.id}
            data-slot="group-chip"
            htmlFor={groupRadioId(row.id)}
            {...fitAttributes(row.fit)}
          >
            <span className={SWATCH} style={{ backgroundColor: row.colour }} />
            {`${row.name} · ${countOf(row)}`}
          </label>
        </span>
      ))}
      {planId === null || !mayAdd ? null : (
        <Link className={NEW_CHIP} data-slot="new-group-chip" href={PLAN_DRAWERS.newGroup(planId)}>
          {GROUP_WORDS.add}
        </Link>
      )}
    </div>
  )
  if (planId === null) return chips
  return <GroupChipRoot planId={planId}>{chips}</GroupChipRoot>
}
