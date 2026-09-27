import { notFound } from 'next/navigation'
import { deletePlan, renamePlan, retimePlan } from '../../../../../actions/plans'
import { DrawerShell } from '../../../../../components/plan/drawer/drawer-shell'
import { SettingsSections } from '../../../../../components/plan/settings/settings-sections'
import { SETTINGS_WORDS } from '../../../../../components/plan/settings/settings-words'
import { ADMIN_CONTROLS } from '../../../../../lib/admin-controls'
import { planPath } from '../../../../../lib/routes'
import { readPlan } from '../read-plan'

/** Props for {@link PlanSettingsPage}. */
export interface PlanSettingsPageProps {
  /** `planId` from `/plans/[planId]/settings`. */
  readonly params: Promise<{ readonly planId: string }>
}

/**
 * `/plans/<planId>/settings`: the plan's own name, its calendar, and deleting it.
 *
 * ### The three that are about the plan rather than about work in it
 *
 * `PlanOwnControls` holds the argument for why these are a group of their own: all three are `manage`, and
 * none of them is about a rail, a feature or an item. They were a `<details>` in the plan heading; a route
 * gives each a reachable address and puts the refusal in one place — this page — rather than in a panel
 * that had to be both mounted conditionally *and* internally conditional.
 *
 * ### It mounts on any one of the three
 *
 * Unlike the two `new/` routes, which each turn on one opener, there is no "may this reader make one of
 * these" question here — the plan already exists. So the page admits a reader who may do **any** of the
 * three, and `SettingsPanel` decides which sections are inside. Both halves are needed, and this one is
 * what makes a reader refused all three meet a 404 rather than an empty drawer.
 *
 * Deleting redirects to the plans index, which is `deletePlan`'s own doing — so the close link here is
 * never the thing that leaves after a delete, and the drawer simply stops existing along with its plan.
 */
export default async function PlanSettingsPage({ params }: PlanSettingsPageProps) {
  const { planId } = await params
  const { plan: own } = ADMIN_CONTROLS
  if (!own.rename && !own.retime && !own.remove) notFound()
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  return (
    <DrawerShell closeHref={planPath(planId)} title={SETTINGS_WORDS.open}>
      <SettingsSections
        mayRemove={own.remove}
        mayRename={own.rename}
        mayRetime={own.retime}
        plan={loaded.value}
        remove={deletePlan}
        rename={renamePlan}
        retime={retimePlan}
      />
    </DrawerShell>
  )
}
