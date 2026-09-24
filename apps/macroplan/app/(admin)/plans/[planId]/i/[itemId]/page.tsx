import { notFound } from 'next/navigation'
import { DrawerPanel } from '../../../../../../components/plan/drawer/drawer-panel'
import { tableRows } from '../../../../../../components/plan/table/rows'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'

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
 * and an id no row answers to is `notFound()` rather than an empty panel. What differs is the two
 * lines each page owns — its own segment's params, and which `kind` of row may answer it — which is
 * why they are two files and not one with a discriminator.
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
 * the API served holds one anyway: deleting a feature deletes its items with it
 * (`PlanContentControls.removeFeature`), so this is a state a fixture can build and an endpoint
 * cannot.
 */
export default async function ItemDrawerPage({ params }: ItemDrawerPageProps) {
  const { planId, itemId } = await params
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  const row = tableRows(loaded.value).find((one) => one.kind === 'item' && one.id === itemId)
  if (row === undefined) notFound()
  return <DrawerPanel closeHref={planPath(planId)} row={row} />
}
