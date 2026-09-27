import { notFound } from 'next/navigation'
import { recolourLabel, removeLabel, renameLabel } from '../../../../../../actions/labels'
import { DrawerShell } from '../../../../../../components/plan/drawer/drawer-shell'
import { LabelForm } from '../../../../../../components/plan/labels/label-form'
import { labelRows } from '../../../../../../components/plan/labels/label-rows'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'

/** Props for {@link GroupDrawerPage}. */
export interface GroupDrawerPageProps {
  /** `planId` and `labelId` from `/plans/[planId]/g/[labelId]`, both untrusted. */
  readonly params: Promise<{ readonly planId: string; readonly labelId: string }>
}

const COUNT = 'text-[13px] text-muted-foreground'

/**
 * `/plans/<planId>/g/<labelId>`: one group, renamed, recoloured or deleted.
 *
 * A group cuts across rails, so how many features are in it is the one fact worth stating beside its name:
 * a release that turns out to hold two features is a different thing from one holding thirty, and nothing
 * else on this surface counts them. `labelRows` already does, for the chips in the heading.
 *
 * It does **not** carry "put this feature in this group". That is a field on the feature's own drawer
 * (`drawer/group-field.tsx`), because a feature points at a label and not the other way round (ADR 0064) —
 * a group with a list of members here would be a second place to write the same pointer, and the two could
 * disagree about a feature whose label was changed from the other side.
 */
export default async function GroupDrawerPage({ params }: GroupDrawerPageProps) {
  const { planId, labelId } = await params
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  const group = labelRows(loaded.value).find((row) => row.id === labelId)
  if (group === undefined) notFound()
  const { content } = ADMIN_CONTROLS
  return (
    <DrawerShell closeHref={planPath(planId)} title={group.name}>
      <p className={COUNT}>{`${String(group.features)} features in this group`}</p>
      <LabelForm
        colour={group.colour}
        labelId={group.id}
        mayRecolour={content.recolourLabel}
        mayRemove={content.removeLabel}
        mayRename={content.renameLabel}
        name={group.name}
        planId={planId}
        recolour={recolourLabel}
        remove={removeLabel}
        rename={renameLabel}
      />
    </DrawerShell>
  )
}
