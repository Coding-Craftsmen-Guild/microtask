import type { ReactNode } from 'react'
import { GroupChips } from './labels/group-chips'
import { labelRows } from './labels/label-rows'
import type { PlanScreenModel } from './plan-screen-model'

/** Props for {@link PlanHeading}. */
export interface PlanHeadingProps {
  /** The plan, reduced so the type cannot hold a share token (ADR 0033). */
  readonly plan: PlanScreenModel

  /**
   * Whatever administers this plan, placed beside its name: the share manager, the bindings panel,
   * or nothing.
   *
   * One slot holding however many managers the page builds, rather than one prop each. The page is
   * what decides which of them a caller may have — it is the only thing holding the credential — and
   * the number of them is not a fact this component has any reason to know. Two props would also mean
   * this file changing every time a third manager arrives, which is the churn the split was for.
   */
  readonly managers: ReactNode
}

/**
 * A plan's name, how it is timed, and whatever administers it.
 *
 * Lifted out of `plan-screen.tsx` because that file had thirteen of its eighty lines left and a
 * fourth slot to fit, and its own TSDoc named this as the next split: "a self-contained group with no
 * peer relationship to anything: it reads three fields of the plan, places one slot, and sits above
 * both the others, so lifting it out moves no sibling past another". Everything inside the view
 * switch stays there, because a `peer-*` variant is a sibling selector and a wrapper around any part
 * of that markup breaks the only connection making the switch work.
 *
 * The settings line repeats what a list row said, because this is the first page reachable by its own
 * URL and an admin arriving from a link has seen no row. The three values are also the three the
 * canvas's whole axis derives from — the `startDate` day 0 counts from, the `sprintLengthDays` a
 * gridline is spaced by, and the `timezone` today is read in — so a bar that looks wrong is checkable
 * against them without opening a drawer.
 *
 * ### The group chips are mounted here rather than handed in
 *
 * They are the one thing in this heading that is **derived** rather than slotted, and that is the point:
 * selecting a group writes nothing, so it needs no credential and cannot be a page’s decision. They were
 * briefly inside the admin-only groups panel, which made the whole feature admin-only by accident — a seat
 * holder was shown a `Group` column naming phases in the table with no way to select one. So they are
 * built from `plan.labels` here, exactly as the table and the canvas are built from the same plan, and a
 * plan with no groups draws nothing at all (`labels/group-chips.tsx`).
 *
 * They sit **inside this component** and so form no row of the screen’s grid, which is the same placement
 * the managers have and for a related reason: the grid below is the drawer, the conflicts and the view
 * switch, and `plan-screen.test.tsx` counts its children to pin that. A wrapper is needed for it — the
 * name and the managers are a `justify-between` flex row and the chips are a line under all of it — so
 * this component now returns a two-row grid whose first row is that flex row.
 *
 * Neither the name nor the settings line carries a `data-testid`: the name is the page's `h1` and the
 * settings line is one unambiguous sentence, so a role query and a text query reach both — and those
 * catch a regression a test hook cannot, an `h1` demoted to a `div` keeping its hook and losing its
 * heading.
 */
export function PlanHeading({ plan, managers }: PlanHeadingProps) {
  return (
    <div className="grid gap-2" data-slot="plan-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{plan.name}</h1>
          <p className="text-[13px] text-muted-foreground">
            {`starts ${plan.startDate} · ${String(plan.sprintLengthDays)}-day sprints · ${plan.timezone}`}
          </p>
        </div>
        {managers}
      </div>
      <GroupChips rows={labelRows(plan)} />
    </div>
  )
}
