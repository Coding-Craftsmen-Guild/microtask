import { notFound } from 'next/navigation'
import { labelFeature, recolourLabel, removeLabel, renameLabel } from '../../../../../../actions/labels'
import { DrawerShell } from '../../../../../../components/plan/drawer/drawer-shell'
import { GroupMembers } from '../../../../../../components/plan/labels/group-members'
import { LabelForm } from '../../../../../../components/plan/labels/label-form'
import { labelRows } from '../../../../../../components/plan/labels/label-rows'
import { joinMembers, memberRows } from '../../../../../../components/plan/labels/member-rows'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'

/** Props for {@link GroupDrawerPage}. */
export interface GroupDrawerPageProps {
  /** `planId` and `labelId` from `/plans/[planId]/g/[labelId]`, both untrusted. */
  readonly params: Promise<{ readonly planId: string; readonly labelId: string }>
}

/**
 * `/plans/<planId>/g/<labelId>`: one group, renamed, recoloured or deleted.
 *
 * A group cuts across rails, so how many features are in it is the one fact worth stating beside its name:
 * a release that turns out to hold two features is a different thing from one holding thirty, and nothing
 * else on this surface counts them. `labelRows` already does, for the chips in the heading.
 *
 * It **does** carry "put this feature in this group" now, which ADR 0064 originally kept off it. The
 * objection was that "a group with a list of members here would be a second place to write the same
 * pointer, and the two could disagree" — and it does not apply to what is here: the boxes send
 * `feature:label`, the same single write the feature's own drawer sends, against the same single record.
 * There is one place the answer is stored and two places to invoke the write, which is not the same thing
 * as two places to store it. `components/plan/labels/group-members.tsx` carries the rest of the argument.
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
      <GroupMembers
        labelId={group.id}
        options={joinMembers(memberRows(loaded.value, group.id))}
        planId={planId}
        setLabel={labelFeature}
      />
    </DrawerShell>
  )
}
