import { notFound } from 'next/navigation'
import { ADMIN_PLAN_ACTIONS } from '../../../../../../components/plan/admin-actions'
import { DrawerPanel } from '../../../../../../components/plan/drawer/drawer-panel'
import { drawerSubject } from '../../../../../../components/plan/drawer/subject'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'
import { readDescription } from './read-description'

/** Props for {@link ItemDrawerPage}. */
export interface ItemDrawerPageProps {
  /** `planId` and `itemId` from `/plans/[planId]/i/[itemId]`, both untrusted. */
  readonly params: Promise<{ readonly planId: string; readonly itemId: string }>
}

/**
 * `/plans/<planId>/i/<itemId>`: one item, open in the drawer slot beside its own plan.
 *
 * The feature drawer beside this one carries the argument both share: one `cache()`d read serves this
 * page and the layout, the subject is resolved through `tableRows` so the drawer and the table cannot
 * word one estimate two ways, a refused read draws nothing because the layout already said so once,
 * and an id no row answers to is `notFound()` rather than an empty panel. Each page owns its own
 * segment's params and the `kind` it resolves, which is why they are two files and not one with a
 * discriminator — and this one owns a read the other has nothing to make.
 *
 * ### The one page in this app that reads twice, and what the second read is for
 *
 * A description is not in the plan: `PlanManifest` is "everything about a plan except its item
 * descriptions", each of which lives in that item's own file. So drawing the description field costs a
 * second `GET`, and `./read-description.ts` argues it — including why a refusal there comes back as a
 * value and reaches the panel as `description={null}`, which draws no box rather than an empty one over
 * text nobody has seen. It runs **after** the row is found, so a stale link costs one request and not
 * two.
 *
 * What it hands down about authority is what the feature drawer hands down, for the reasons recorded
 * there: `ADMIN_CONTROLS.content` — the content half alone, a drawer asking nothing about seats — and
 * `ADMIN_PLAN_ACTIONS`, neither of them a gate.
 *
 * ### One absence this route answers 404 that the plan can still hold
 *
 * An item whose `featureId` names no feature in the plan gets **no row**: `itemsByFeature` groups it
 * under that id and it is then "simply never asked for" (`@repo/schedule`), so the canvas draws
 * nothing for it and the table lists it nowhere. This page answers `notFound()` for it, which is a
 * hair narrower than "the plan holds this id" — and it is the honest answer of the three available.
 * There is no rail, no feature and no sprint to draw such an item against, a panel of one name and
 * three blanks would be worse than the not-found sentence, and inventing a rail for it would be a
 * claim about where the work sits (`rows.ts` refuses the same invention for the same reason). No plan
 * the API served holds one anyway: `withoutFeatures` in
 * `packages/macroplan-domain/src/services/cascade.ts` drops every item whose `featureId` is in the
 * removed set, and `withoutEpic` is built on it, so a feature delete and a rail delete both take their
 * items with them. That is the cascade itself and not `PlanContentControls.removeFeature`, which is a
 * boolean about whether a surface draws a delete control and is explicitly "a rendering answer and
 * never a gate" (`lib/plan-capabilities.ts`). So this is a state a fixture can build and an endpoint
 * cannot.
 */
export default async function ItemDrawerPage({ params }: ItemDrawerPageProps) {
  const { planId, itemId } = await params
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  const subject = drawerSubject(loaded.value, 'item', itemId)
  if (subject === undefined) notFound()
  const described = await readDescription(planId, itemId)
  return (
    <DrawerPanel
      actions={ADMIN_PLAN_ACTIONS}
      closeHref={planPath(planId)}
      controls={ADMIN_CONTROLS.content}
      description={described.ok ? described.value : null}
      planId={planId}
      row={subject.row}
      values={subject.values}
    />
  )
}
