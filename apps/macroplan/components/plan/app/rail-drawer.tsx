import { bindingRows } from '../bridge/binding-rows'
import { RailBinding } from '../bridge/rail-binding'
import { DrawerShell } from '../drawer/drawer-shell'
import { RailFeature } from '../rails/rail-feature'
import { RailForm } from '../rails/rail-form'
import { railRows } from '../rails/rail-rows'
import { DrawerGone } from './drawer-gone'
import { usePlanSession, usePlanSnapshot } from './plan-session'

/** Props for {@link RailDrawer}. */
export interface RailDrawerProps {
  readonly epicId: string
}

/**
 * One rail's drawer: its name, colour and place, a feature to add to it, and what it is bound to.
 *
 * The page `r/[epicId]` was, drawn in the browser from the plan the store holds (ADR 0069). Every write but
 * the bind-by-project goes through the store, so a rename or a recolour is on the rail the moment it is
 * made; binding is about another product, and its answer arrives with the bridge re-read on the server.
 */
export function RailDrawer({ epicId }: RailDrawerProps) {
  const { writes, controls, home, bridge, bindProject } = usePlanSession()
  const { plan } = usePlanSnapshot()
  const rail = railRows(plan).find((row) => row.id === epicId)
  if (rail === undefined) return <DrawerGone />
  const binding = bindingRows(plan, bridge).find((row) => row.epicId === epicId)
  const { content } = controls
  return (
    <DrawerShell closeHref={home} title={rail.name}>
      <RailForm
        colour={rail.colour}
        epicId={rail.id}
        features={rail.features}
        mayRecolour={content.recolourEpic}
        mayRemove={content.removeEpic}
        mayRename={content.renameEpic}
        mayReorder={content.reorderEpic}
        name={rail.name}
        planId={plan.id}
        railOrder={rail.railOrder}
        recolour={writes.recolourEpic}
        remove={writes.removeEpic}
        rename={writes.renameEpic}
        reorder={writes.reorderEpic}
      />
      {content.createFeature ? (
        <RailFeature createFeature={writes.createFeature} epicId={rail.id} planId={plan.id} railName={rail.name} />
      ) : null}
      {content.bindEpic && binding !== undefined && bindProject !== null ? (
        <RailBinding
          bind={writes.bindEpic}
          bindProject={bindProject}
          mayUnbind={content.unbindEpic}
          planId={plan.id}
          row={binding}
          unbind={writes.unbindEpic}
        />
      ) : null}
    </DrawerShell>
  )
}
