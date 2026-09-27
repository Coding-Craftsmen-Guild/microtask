import type { DeleteWrite } from './delete-plan'
import type { RenameWrite } from './plan-name-form'
import { SettingsSections } from './settings-sections'
import { SETTINGS_WORDS } from './settings-words'
import type { RetimeWrite } from './timing-form'
import type { PlanScreenModel } from '../plan-screen-model'

const PANEL = 'rounded-lg border border-border p-3'

const SUMMARY = 'cursor-pointer text-[13px] font-semibold'

const SECTIONS = 'grid gap-3 pt-3'

/** Props for {@link SettingsPanel}. */
export interface SettingsPanelProps {
  /** The plan, for the three stored values the forms open with and the name the confirm quotes. */
  readonly plan: PlanScreenModel

  /** Renames it. */
  readonly rename: RenameWrite

  /** Retimes it. */
  readonly retime: RetimeWrite

  /** Deletes it. */
  readonly remove: DeleteWrite

  /** Whether the name is editable — `PlanOwnControls.rename`, spread to a boolean. */
  readonly mayRename: boolean

  /** Whether the calendar is editable — `PlanOwnControls.retime`. */
  readonly mayRetime: boolean

  /** Whether deleting is offered — `PlanOwnControls.remove`. */
  readonly mayRemove: boolean
}

/**
 * A plan's own name, its calendar and its deletion, behind a closed disclosure.
 *
 * ### Why this exists at all, stated plainly
 *
 * It did not, for four phases. A plan could be created and then never renamed, never retimed and never
 * deleted: a plan given the wrong start date was wrong permanently, and a plan made by mistake stayed on
 * the index for ever. All three routes had existed since phase 1 with client methods and tests, and
 * `lib/plan-capabilities.ts` recorded the absence of controls as deliberate on the grounds that a boolean
 * for a write nothing calls answers a question nobody asks. That was sound and its conclusion had gone
 * stale in the worst direction — see {@link PlanOwnControls}, which is the group this panel spends.
 *
 * ### Three sections and three requests
 *
 * The name and the calendar are separate forms because the API gates them separately: a body carrying a
 * name and a date meets `plan:rename` **and** `plan:retime`, and the first refusal writes neither. The
 * calendar's own three fields **are** one request, because all three meet one gate — which is the rule
 * `lib/plan-capabilities.ts` states for a combined body, satisfied here rather than worked around.
 *
 * ### Closed, and last among the managers
 *
 * A `<details>` for the reason the bindings, groups and rails panels are: five expanded panels above a
 * timeline would put the plan's name thousands of pixels from its bars. It is placed **after** the other
 * four in the heading row, because it is the only one holding a control that destroys the page it is on —
 * a reader reaching for the group chips should not pass `Delete plan` on the way.
 *
 * A reader refused everything draws **nothing at all**: with no rename, no retime and no delete there is
 * no section left, and an empty disclosure is a control that opens onto nothing. That is the one case this
 * component answers `null` for, and the page's own decision to mount it is a different question — it
 * mounts on any one of the three.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const { plan, rename, retime, remove, mayRename, mayRetime, mayRemove } = props
  if (!mayRename && !mayRetime && !mayRemove) return null
  return (
    <details className={PANEL} data-slot="settings-panel">
      <summary className={SUMMARY}>{SETTINGS_WORDS.open}</summary>
      <div className={SECTIONS}>
        <SettingsSections
          mayRemove={mayRemove}
          mayRename={mayRename}
          mayRetime={mayRetime}
          plan={plan}
          remove={remove}
          rename={rename}
          retime={retime}
        />
      </div>
    </details>
  )
}
