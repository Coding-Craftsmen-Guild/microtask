import { DrawerShell } from '../drawer/drawer-shell'
import { GroupMembers } from '../labels/group-members'
import { LabelForm } from '../labels/label-form'
import { labelRows } from '../labels/label-rows'
import { joinMembers, memberRows } from '../labels/member-rows'
import { NewLabelForm } from '../labels/new-label-form'
import { NewRailForm } from '../rails/new-rail-form'
import { nextRailColour } from '../rails/rail-palette'
import { DrawerGone } from './drawer-gone'
import { usePlanSession, usePlanSnapshot } from './plan-session'

const ADD_RAIL = 'Add a rail'

const ADD_GROUP = 'Add a group'

/**
 * One group's drawer: its name and colour, and which features are in it — the page `g/[labelId]` was,
 * drawn from the store (ADR 0069).
 */
export function GroupDrawer({ labelId }: { readonly labelId: string }) {
  const { writes, controls, root } = usePlanSession()
  const { plan } = usePlanSnapshot()
  const group = labelRows(plan).find((row) => row.id === labelId)
  if (group === undefined) return <DrawerGone />
  const { content } = controls
  return (
    <DrawerShell closeHref={root} title={group.name}>
      <LabelForm
        colour={group.colour}
        labelId={group.id}
        mayRecolour={content.recolourLabel}
        mayRemove={content.removeLabel}
        mayRename={content.renameLabel}
        name={group.name}
        planId={plan.id}
        recolour={writes.recolourLabel}
        remove={writes.removeLabel}
        rename={writes.renameLabel}
      />
      <GroupMembers
        labelId={group.id}
        options={joinMembers(memberRows(plan, group.id))}
        planId={plan.id}
        setLabel={writes.labelFeature}
      />
    </DrawerShell>
  )
}

/**
 * The add-a-rail drawer, in the hue the next rail takes — `new/rail` as it was, drawn from the store.
 *
 * @param props - How many rails the plan held when the address was written, which picks the hue.
 */
export function NewRailDrawer({ count }: { readonly count: number }) {
  const { writes, controls, root } = usePlanSession()
  const { plan } = usePlanSnapshot()
  if (!controls.content.createEpic) return <DrawerGone />
  return (
    <DrawerShell closeHref={root} title={ADD_RAIL}>
      <NewRailForm colour={nextRailColour(count)} create={writes.createEpic} planId={plan.id} />
    </DrawerShell>
  )
}

/** The add-a-group drawer — `new/group` as it was, drawn from the store. */
export function NewGroupDrawer() {
  const { writes, controls, root } = usePlanSession()
  const { plan } = usePlanSnapshot()
  if (!controls.content.createLabel) return <DrawerGone />
  return (
    <DrawerShell closeHref={root} title={ADD_GROUP}>
      <NewLabelForm create={writes.createLabel} planId={plan.id} />
    </DrawerShell>
  )
}
