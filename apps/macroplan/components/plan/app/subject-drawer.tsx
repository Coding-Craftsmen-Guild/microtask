import { attentionOf } from '../attention/attention'
import { AttentionCallout } from '../attention/attention-mark'
import { itemLink } from '../bridge/item-link'
import { DrawerPanel } from '../drawer/drawer-panel'
import { LinkField } from '../drawer/link-field'
import { tabStack } from '../drawer/tab-stack'
import { tabViews } from '../drawer/tab-view'
import { DrawerGone } from './drawer-gone'
import { usePlanSession, usePlanSnapshot } from './plan-session'
import { useItemExtras } from './use-item-extras'
import { useSubject } from './use-subject'

/** Props for {@link SubjectDrawer}. */
export interface SubjectDrawerProps {
  readonly kind: 'feature' | 'item'
  readonly id: string

  /** The `open` parameter: the other tabs open beside this one. */
  readonly open: string | null
}

/**
 * A feature's or an item's drawer, drawn in the browser from the plan it already holds.
 *
 * It was two pages per surface (`f/[featureId]` and `i/[itemId]`, under both roots), each reading the plan
 * on the server, and an item's reading its description and its rail's tasks besides. This is those four
 * pages as one component (ADR 0069): the subject, its tabs and its fields come from the store — so an edit
 * made here is on the board the moment it is made — and only an item's description and task list are
 * fetched, once, while the panel is already on screen.
 *
 * The writes it hands its fields are the session's, which are optimistic; a field still awaits its write's
 * answer to say why it was refused.
 */
export function SubjectDrawer({ kind, id, open }: SubjectDrawerProps) {
  const session = usePlanSession()
  const { plan, saving } = usePlanSnapshot()
  const extras = useItemExtras(kind === 'item' ? id : null)
  const held = useSubject(plan, saving, { kind, id })
  if (held === undefined) return <DrawerGone />
  const { content } = session.controls
  const active = { id, kind }
  const state = itemLink(held.plan, session.bridge, id, extras?.tasks ?? null)
  const link =
    kind === 'item' && content.linkItem ? (
      <LinkField
        bound={state.bound}
        createTask={session.writes.createTask}
        itemId={id}
        link={session.writes.linkItem}
        manages={state.manages}
        mayCreate={content.createTask}
        mayUnlink={content.unlinkItem}
        options={state.options}
        planId={plan.id}
        taskName={state.taskName}
        unlink={session.writes.unlinkItem}
      />
    ) : null
  return (
    <DrawerPanel
      actions={session.writes}
      attention={<AttentionCallout on={attentionOf(held.plan).get(held.subject.row.id)} />}
      closeHref={session.root}
      controls={content}
      description={extras?.description ?? null}
      link={link}
      planId={plan.id}
      row={held.subject.row}
      tabs={tabViews(held.plan, tabStack(open ?? undefined, active), active, session.root)}
      values={held.subject.values}
    />
  )
}
