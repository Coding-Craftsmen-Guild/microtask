import { LabelForm, type LabelDelete, type LabelWrite } from './label-form'
import type { LabelRow } from './label-rows'
import { NewLabelForm, type CreateLabelWrite } from './new-label-form'

const SUMMARY = 'cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground'

const CARD = 'mt-2 grid gap-3 rounded-md border bg-card p-3'

const GROUP = 'grid gap-1.5 border-b pb-3 last:border-b-0 last:pb-0'

/** Props for {@link LabelsPanel}. */
export interface LabelsPanelProps {
  /** The plan whose groups these are. */
  readonly planId: string

  /** Every group, with what each holds. */
  readonly rows: readonly LabelRow[]

  /** Adds one. */
  readonly create: CreateLabelWrite

  /** Renames one. */
  readonly rename: LabelWrite

  /** Recolours one. */
  readonly recolour: LabelWrite

  /** Removes one. */
  readonly remove: LabelDelete

  /**
   * Whether to offer removing a group — `PlanContentControls.removeLabel`, spread to a boolean.
   *
   * A flat boolean rather than the whole `PlanControls`, exactly as `BindingsPanel` takes `mayUnbind`: the
   * form below is a client component and `module-boundaries.test.tsx` admits nothing but primitives across
   * that boundary. Whether to draw the editing half **at all** is the page's own decision from
   * `createLabel`, which is why that answer does not arrive here.
   */
  readonly mayRemove: boolean

  /** Whether a group name is editable — `renameLabel`, spread to a boolean for the same reason. */
  readonly mayRename: boolean

  /** Whether a group hue is editable — `recolourLabel`, drawn as its own control. */
  readonly mayRecolour: boolean
}

/** What the disclosure is called, and what it says for a plan with no groups yet. */
export const LABELS_WORDS = {
  edit: 'Groups',
  none: 'No groups yet. A group is a phase or a release: features from any rail can be in one.',
} as const

/**
 * The forms that name a plan's groups, recolour them and delete them, behind a closed disclosure.
 *
 * **The chips that select a group are not here, and that separation is the correction this file records.**
 * They were, and it made the feature admin-only by accident: this panel is a slot filled by the page that
 * read the credential — `label:create` is `manage`-tier — and `/s/<token>`'s page passes `null`, so a seat
 * holder saw a `Group` column naming phases in the table and had no way to select one. Selecting a group
 * writes nothing and needs no authority at all, so `GroupChips` is now mounted by `PlanScreen` from
 * `plan.labels`, the way the table and the canvas are mounted from the same plan. What is left here is
 * administration, and it sits behind a `<details>` the browser owns, closed by default: a plan’s phases
 * are named once and looked at every day.
 *
 * It sits in the heading row beside the share manager and the bindings panel, and not as a drawer route,
 * for the reason `BindingsPanel` gives: there is no `g/[labelId]` segment and there should not be, because
 * this is a rare act over up to `LIMITS.labelsPerPlan` groups at once and an admin doing it wants to see
 * the ones that are **empty** — which a drawer showing one subject cannot answer.

 */
export function LabelsPanel(props: LabelsPanelProps) {
  const { planId, rows, create, rename, recolour, remove, mayRemove } = props
  const { mayRename, mayRecolour } = props
  return (
    <div className="grid w-full gap-1.5" data-slot="labels-panel">
      <details>
        <summary className={SUMMARY}>{`${LABELS_WORDS.edit} (${String(rows.length)})`}</summary>
        <div className={CARD}>
          {rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{LABELS_WORDS.none}</p>
          ) : null}
          {rows.map((row) => (
            <div className={GROUP} key={row.id}>
              <LabelForm
                colour={row.colour}
                labelId={row.id}
                mayRecolour={mayRecolour}
                mayRemove={mayRemove}
                mayRename={mayRename}
                name={row.name}
                planId={planId}
                recolour={recolour}
                remove={remove}
                rename={rename}
              />
            </div>
          ))}
          <NewLabelForm create={create} planId={planId} />
        </div>
      </details>
    </div>
  )
}
