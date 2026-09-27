import { notFound } from 'next/navigation'
import { bindEpic, bindEpicProject, unbindEpic } from '../../../../../../actions/bridge'
import { recolourEpic, removeEpic, renameEpic, reorderEpic } from '../../../../../../actions/epics'
import { createFeature } from '../../../../../../actions/features'
import { bindingRows } from '../../../../../../components/plan/bridge/binding-rows'
import { RailBinding } from '../../../../../../components/plan/bridge/rail-binding'
import { DrawerShell } from '../../../../../../components/plan/drawer/drawer-shell'
import { RailFeature } from '../../../../../../components/plan/rails/rail-feature'
import { RailForm } from '../../../../../../components/plan/rails/rail-form'
import { railRows } from '../../../../../../components/plan/rails/rail-rows'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readBridge } from '../../read-bridge'
import { readPlan } from '../../read-plan'

/** Props for {@link RailDrawerPage}. */
export interface RailDrawerPageProps {
  /** `planId` and `epicId` from `/plans/[planId]/r/[epicId]`, both untrusted. */
  readonly params: Promise<{ readonly planId: string; readonly epicId: string }>
}

/**
 * `/plans/<planId>/r/<epicId>`: one rail, with everything that is done to a rail.
 *
 * ### Why a rail's binding is here and not in a panel over all of them
 *
 * Design §2. Through phase 4 the plan heading carried a `Microtask bindings (N rails)` disclosure over
 * every rail at once, which took the most valuable strip of the page to say `(0 rails)` on every plan that
 * binds nothing — and most bind nothing. A binding belongs to one rail, so it belongs where that rail is
 * open, beside its name and its hue rather than beside thirty-nine others.
 *
 * The three-state sentence above the form is `bindingStateOf`'s, and it is the reason this page makes the
 * **second** read: the plan knows what is *stored* and the bridge knows what is *live*, and the difference
 * between them is the whole of the third state — bound, with a token that no longer works. This is the one
 * surface whose reader can fix that, so it is the one surface that says it (ADR 0061).
 *
 * ### Adding a feature is here too, and that is one decision
 *
 * A feature names the rail it sits on and nothing else, so "add a feature" is one name field on the rail
 * it is added to. `lib/drawer-routes.ts` records why that is not a route of its own. It is also the one
 * control on this page granted to **`write`** where every rail control is `manage`, so the two halves are
 * drawn on their own answers: a reader may be able to add a feature to a rail it may not rename.
 *
 * ### One read, shared
 *
 * `readPlan(planId)` is `cache()`d on exactly that argument, so on a cold load this and the layout share
 * one call; on a soft navigation the layout does not render and this is the only read. `readBridge` is the
 * same, which is why opening a rail costs no request the plan page did not already make.
 *
 * A rail id naming nothing is `notFound()` — the drawer's boundary, which renders inside the layout and so
 * keeps the plan on screen beside it — and never an empty panel: the read answered the whole plan, so an
 * absence is a stale link rather than something still loading.
 */
export default async function RailDrawerPage({ params }: RailDrawerPageProps) {
  const { planId, epicId } = await params
  const [loaded, bridge] = await Promise.all([readPlan(planId), readBridge(planId)])
  if (!loaded.ok) return null
  const rail = railRows(loaded.value).find((row) => row.id === epicId)
  if (rail === undefined) notFound()
  const binding = bindingRows(loaded.value, bridge).find((row) => row.epicId === epicId)
  const { content } = ADMIN_CONTROLS
  return (
    <DrawerShell closeHref={planPath(planId)} title={rail.name}>
      <RailForm
        colour={rail.colour}
        epicId={rail.id}
        features={rail.features}
        mayRecolour={content.recolourEpic}
        mayRemove={content.removeEpic}
        mayRename={content.renameEpic}
        mayReorder={content.reorderEpic}
        name={rail.name}
        planId={planId}
        railOrder={rail.railOrder}
        recolour={recolourEpic}
        remove={removeEpic}
        rename={renameEpic}
        reorder={reorderEpic}
      />
      {content.createFeature ? (
        <RailFeature
          createFeature={createFeature}
          epicId={rail.id}
          planId={planId}
          railName={rail.name}
        />
      ) : null}
      {content.bindEpic && binding !== undefined ? (
        <RailBinding
          bind={bindEpic}
          bindProject={bindEpicProject}
          mayUnbind={content.unbindEpic}
          planId={planId}
          row={binding}
          unbind={unbindEpic}
        />
      ) : null}
    </DrawerShell>
  )
}
