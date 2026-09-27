import { DeletePlan, type DeleteWrite } from './delete-plan'
import { PlanNameForm, type RenameWrite } from './plan-name-form'
import { SETTINGS_WORDS } from './settings-words'
import { TimingForm, type RetimeWrite } from './timing-form'
import type { PlanScreenModel } from '../plan-screen-model'

const SECTION = 'grid gap-0.5'

const HEADING = 'text-[12px] font-semibold tracking-wide text-muted-foreground uppercase'

/** Props for {@link SettingsSections}: the three plan-level writes, and one answer each. */
export interface SettingsSectionsProps {
  /** The plan being changed, read for the values each form starts from. */
  readonly plan: PlanScreenModel

  readonly rename: RenameWrite

  readonly retime: RetimeWrite

  readonly remove: DeleteWrite

  readonly mayRename: boolean

  readonly mayRetime: boolean

  readonly mayRemove: boolean
}

/**
 * The plan's name, its calendar and deleting it: three headed sections and no container.
 *
 * ### Why this is separate from `SettingsPanel`
 *
 * Two surfaces want these three forms in two different frames. The admin's is a drawer route
 * (`/plans/<planId>/settings`), which supplies its own heading and its own panel, so a `<details>` inside it
 * would be a disclosure inside a drawer — one more thing to open having already opened something. The seat
 * surface still puts them in the plan heading as a collapsed disclosure, which is what `SettingsPanel` is.
 *
 * So the composition lives here and the frame is the caller's. The alternative — a `collapsible` boolean on
 * one component — puts a rendering decision that belongs to a page inside a component, and the two frames
 * differ by more than a wrapper: one has a heading of its own and the other needs a summary.
 *
 * ### Each section on its own answer
 *
 * All three are `manage` in the kernel, so in practice a reader holds all of them or none — but they are
 * read as three because `PlanOwnControls` describes them as three, and a control drawn on somebody else's
 * answer is what `lib/plan-capabilities.ts` calls decoration. A caller with none of the three draws no
 * sections at all, and it is the caller that decides whether that means an empty frame or no frame:
 * `SettingsPanel` answers `null`, and the drawer route 404s.
 */
export function SettingsSections(props: SettingsSectionsProps) {
  const { plan, rename, retime, remove, mayRename, mayRetime, mayRemove } = props
  return (
    <>
      {mayRename ? (
        <div className={SECTION}>
          <p className={HEADING}>{SETTINGS_WORDS.name}</p>
          <PlanNameForm name={plan.name} planId={plan.id} rename={rename} />
        </div>
      ) : null}
      {mayRetime ? (
        <div className={SECTION}>
          <p className={HEADING}>{SETTINGS_WORDS.timing}</p>
          <TimingForm
            planId={plan.id}
            retime={retime}
            sprintLengthDays={plan.sprintLengthDays}
            startDate={plan.startDate}
            timezone={plan.timezone}
          />
        </div>
      ) : null}
      {mayRemove ? (
        <div className={SECTION}>
          <p className={HEADING}>{SETTINGS_WORDS.danger}</p>
          <DeletePlan name={plan.name} planId={plan.id} remove={remove} />
        </div>
      ) : null}
    </>
  )
}
