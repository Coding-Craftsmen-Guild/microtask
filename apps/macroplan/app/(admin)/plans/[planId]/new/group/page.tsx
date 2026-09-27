import { notFound } from 'next/navigation'
import { createLabel } from '../../../../../../actions/labels'
import { DrawerShell } from '../../../../../../components/plan/drawer/drawer-shell'
import { NewLabelForm } from '../../../../../../components/plan/labels/new-label-form'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'

/** Props for {@link NewGroupPage}. */
export interface NewGroupPageProps {
  /** `planId` from `/plans/[planId]/new/group`, spent only in a path and a write. */
  readonly params: Promise<{ readonly planId: string }>
}

const TITLE = 'Add a group'

/**
 * `/plans/<planId>/new/group`: the form that makes a label features on any rail can be put into.
 *
 * A group is the one grouping that deliberately cuts **across** rails (design §3, ADR 0064), so it is a
 * plan-level thing and its form belongs beside the plan's other three rather than under a rail — which is
 * why this sits next to `new/rail` under one `new` segment and not under `r/<epicId>`.
 *
 * It reads the plan not at all, for {@link NewRailPage}'s reason: a new group is a name and a colour, and
 * neither depends on what the plan holds. The `planId` is spent in the close link and in the write.
 */
export default async function NewGroupPage({ params }: NewGroupPageProps) {
  const { planId } = await params
  if (!ADMIN_CONTROLS.content.createLabel) notFound()
  return (
    <DrawerShell closeHref={planPath(planId)} title={TITLE}>
      <NewLabelForm create={createLabel} planId={planId} />
    </DrawerShell>
  )
}
