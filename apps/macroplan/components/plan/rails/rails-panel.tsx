import { NewRailForm, type CreateRailWrite } from './new-rail-form'
import { RailFeature, type CreateFeatureWrite } from './rail-feature'
import { RailForm, type RailDelete, type RailOrderWrite, type RailWrite } from './rail-form'
import type { RailRow } from './rail-rows'

const SUMMARY = 'cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground'

const CARD = 'mt-2 grid gap-3 rounded-md border bg-card p-3'

const GROUP = 'grid gap-1.5 border-b pb-3 last:border-b-0 last:pb-0'

/** Props for {@link RailsPanel}. */
export interface RailsPanelProps {
  /** The plan whose rails these are. */
  readonly planId: string

  /** Every rail, in the order the timeline draws them, with what is on each. */
  readonly rows: readonly RailRow[]

  /** Adds one. */
  readonly create: CreateRailWrite

  /** Renames one. */
  readonly rename: RailWrite

  /** Recolours one. */
  readonly recolour: RailWrite

  /** Moves one among its siblings. */
  readonly reorder: RailOrderWrite

  /** Removes one, and everything on it. */
  readonly remove: RailDelete

  /** Adds a feature to one, which is the write that makes a new rail useful at once. */
  readonly createFeature: CreateFeatureWrite

  /** Whether a rail name is editable — `renameEpic`, spread to a boolean. */
  readonly mayRename: boolean

  /** Whether a rail hue is editable — `recolourEpic`. Two controls off one action, drawn separately. */
  readonly mayRecolour: boolean

  /** Whether to offer moving a rail — `reorderEpic`, spread to a boolean. */
  readonly mayReorder: boolean

  /** Whether to offer removing one — `removeEpic`, spread to a boolean. */
  readonly mayRemove: boolean

  /** Whether to offer adding a feature — `createFeature`, spread to a boolean. */
  readonly mayAddFeature: boolean
}

/** What this panel is called, and what it says for a plan that has no rails yet. */
export const RAILS_WORDS = {
  edit: 'Rails',
  none: 'No rails yet. A feature has to sit on one, so this is where a plan starts.',
} as const

/**
 * Every rail of the plan, editable, with a box to add one and a box to put a feature on each.
 *
 * ### Why this panel exists at all
 *
 * It is the way into a plan. A feature names the rail it sits on, every other write in Macroplan is
 * addressed at a feature or an item under one, and the drawer that creates either can only be opened on
 * something that already exists — so before this, a plan created was a plan that could hold nothing, for
 * ever. The five rail actions had been shipped and wired on both surfaces since phase 3 with no call site,
 * recorded as deliberate because spec §9's phase-3 row does not name a rail editor. The row does not; what
 * it also does not say is that without one the product has no first step.
 *
 * ### Closed by default, and what that costs
 *
 * A `<details>` for the reason the groups panel beside it is one: the heading row holds four managers now,
 * and four expanded panels would push the timeline off the first screen. The **empty** state is the one
 * case where that is a real cost — a new plan's most important control is one click behind a summary — so
 * the summary carries the rail count, and a plan with none reads `Rails (0)`, which is both the count and
 * the invitation.
 *
 * ### One `<details>`, not one per rail
 *
 * Each rail is a row rather than its own disclosure, so reordering can be read: the lanes are listed in
 * `railOrder` and a reader compares the numbers down the column. Nested disclosures would hide exactly the
 * comparison the lane field is for.
 */
export function RailsPanel(props: RailsPanelProps) {
  const { planId, rows, create, rename, recolour, reorder, remove, createFeature } = props
  const { mayReorder, mayRemove, mayAddFeature, mayRename, mayRecolour } = props
  return (
    <div className="grid w-full gap-1.5" data-slot="rails-panel">
      <details>
        <summary className={SUMMARY}>{`${RAILS_WORDS.edit} (${String(rows.length)})`}</summary>
        <div className={CARD}>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{RAILS_WORDS.none}</p>
          ) : null}
          {rows.map((row) => (
            <div className={GROUP} key={row.id}>
              <RailForm
                colour={row.colour}
                epicId={row.id}
                features={row.features}
                mayRecolour={mayRecolour}
                mayRemove={mayRemove}
                mayRename={mayRename}
                mayReorder={mayReorder}
                name={row.name}
                planId={planId}
                railOrder={row.railOrder}
                recolour={recolour}
                remove={remove}
                rename={rename}
                reorder={reorder}
              />
              {mayAddFeature ? (
                <RailFeature
                  createFeature={createFeature}
                  epicId={row.id}
                  planId={planId}
                  railName={row.name}
                />
              ) : null}
            </div>
          ))}
          <NewRailForm create={create} planId={planId} />
        </div>
      </details>
    </div>
  )
}
