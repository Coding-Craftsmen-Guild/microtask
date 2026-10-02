import { notFound } from 'next/navigation'
import { ADMIN_PLAN_ACTIONS } from '../../../../../../components/plan/admin-actions'
import { attentionOf } from '../../../../../../components/plan/attention/attention'
import { AttentionCallout } from '../../../../../../components/plan/attention/attention-mark'
import { DrawerPanel } from '../../../../../../components/plan/drawer/drawer-panel'
import { drawerSubject } from '../../../../../../components/plan/drawer/subject'
import { openParam, type SearchParams } from '../../../../../../components/plan/drawer/tab-params'
import { tabStack } from '../../../../../../components/plan/drawer/tab-stack'
import { tabViews } from '../../../../../../components/plan/drawer/tab-view'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'

/** Props for {@link FeatureDrawerPage}. */
export interface FeatureDrawerPageProps {
  /** The plan and the feature the URL names. */
  readonly params: Promise<{ readonly planId: string; readonly featureId: string }>

  /** The query, which carries the other open tabs (`drawer/tab-stack.ts`). */
  readonly searchParams: Promise<SearchParams>
}

/**
 * One feature, open in the panel under the board.
 *
 * The **route** names the active tab and the query names the rest, which is what keeps a drawer
 * deep-linkable while a reader has several subjects open: this page resolves its own subject exactly as
 * it always did, and reads the stack beside it out of the same plan.
 */
export default async function FeatureDrawerPage({ params, searchParams }: FeatureDrawerPageProps) {
  const { planId, featureId } = await params
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  const subject = drawerSubject(loaded.value, 'feature', featureId)
  if (subject === undefined) notFound()
  const active = { id: featureId, kind: 'feature' as const }
  const root = planPath(planId)
  const open = openParam(await searchParams)
  return (
    <DrawerPanel
      actions={ADMIN_PLAN_ACTIONS}
      attention={<AttentionCallout on={attentionOf(loaded.value).get(subject.row.id)} />}
      closeHref={root}
      controls={ADMIN_CONTROLS.content}
      description={null}
      link={null}
      planId={planId}
      row={subject.row}
      tabs={tabViews(loaded.value, tabStack(open, active), active, root)}
      values={subject.values}
    />
  )
}
