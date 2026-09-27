import { notFound } from 'next/navigation'
import {
  createPlanSeat,
  readPlanSeats,
  revokePlanSeat,
  updatePlanSeat,
} from '../../../../../actions/plan-share-links'
import { DrawerShell } from '../../../../../components/plan/drawer/drawer-shell'
import { ShareManager } from '../../../../../components/plan/share/share-manager'
import { ADMIN_CONTROLS } from '../../../../../lib/admin-controls'
import { planPath } from '../../../../../lib/routes'

/** Props for {@link PlanSharePage}. */
export interface PlanSharePageProps {
  /** `planId` from `/plans/[planId]/share`, spent in the close link and in four writes. */
  readonly params: Promise<{ readonly planId: string }>
}

const TITLE = 'Share this plan'

/**
 * `/plans/<planId>/share`: the seats over this plan — minted, renamed, re-roled and revoked.
 *
 * ### The outward half of design §7's two links
 *
 * §7 opens by warning that two different things in this product are called a link, they point in opposite
 * directions, and confusing them is the fastest way to build a credential leak. This hands a link **out**
 * so somebody can see the plan; the rail drawer's bind form holds a credential **inward** so the plan can
 * read Microtask. They used to sit beside each other in the heading precisely so the difference was visible
 * to whoever was doing both — and that argument is why moving them apart is worth stating rather than
 * doing quietly: each is now one subject's drawer, the plan's and a rail's, and the thing that keeps them
 * distinguishable is that they are no longer two disclosures with similar labels in one row.
 *
 * ### It reads the plan not at all
 *
 * `ShareManager` fetches its own seats through `listSeats` when it opens, which is what keeps every live
 * token out of this page's Flight payload: the admin's plan read answers `shareLinks` in full (ADR 0033),
 * and a page that read it here to count them would put them in the payload to render a number.
 *
 * So the `planId` is spent in the close link and in the four writes, and nothing on this route holds a
 * token at any point.
 */
export default async function PlanSharePage({ params }: PlanSharePageProps) {
  const { planId } = await params
  const seats = ADMIN_CONTROLS.seats
  if (!seats.read && !seats.create) notFound()
  return (
    <DrawerShell closeHref={planPath(planId)} title={TITLE}>
      <ShareManager
        editSeat={updatePlanSeat}
        listSeats={readPlanSeats}
        mayCreate={seats.create}
        mayRead={seats.read}
        mayRevoke={seats.revoke}
        mayUpdate={seats.update}
        mintSeat={createPlanSeat}
        planId={planId}
        revokeSeat={revokePlanSeat}
      />
    </DrawerShell>
  )
}
