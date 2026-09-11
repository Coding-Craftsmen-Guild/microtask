import type { Decoded } from '@repo/api-client'
import { capabilities, mayReach, type ShareView } from '@repo/contracts'
import type { ReactNode } from 'react'
import { linkShareActions } from '../../../components/link/link-actions'
import { LinkHead } from '../../../components/link/link-head'
import { LinkTaskList } from '../../../components/link/link-task-list'
import { exposureOf } from '../../../components/projects/page-model'
import { inTreeOrder, progressOf } from '../../../components/projects/summary'
import { ShareManager } from '../../../components/share-manager/share-manager'
import { projectChoices } from '../../../components/share-manager/task-share'
import { shareControls } from '../../../components/share-manager/types'
import { readLinkShareCount } from './read-share'

type Share = Decoded<typeof ShareView>

/**
 * A project-scoped link's landing page: the project's head, then its tasks, each linking to
 * `/s/<token>/t/<taskId>` (ADR 0037).
 *
 * Everything drawn is what `shares/current` answered, which carries no token of any kind. A
 * `manage` link gets the project page's Share — list, mint, rename, change role, revoke — because
 * a project scope clears every share action, and the confirm before a project-wide link names
 * everything it would open (ADR 0011). Its links load when the dialog opens, never here
 * (ADR 0033); the count beside Share is reduced to a number on the server.
 */
export async function linkListPage(token: string, share: Share): Promise<ReactNode> {
  const can = capabilities(share.role, share.scope)
  const count = can['share:read'] ? await readLinkShareCount(token, share.project.id, null) : undefined
  const manager = (
    <ShareManager actions={linkShareActions(token)} choices={projectChoices(share.project.id, inTreeOrder(share.folders, share.tasks))} controls={shareControls(can)} count={count} exposure={exposureOf(share)} projectId={share.project.id} />
  )
  return (
    <div className="grid gap-6 pt-6">
      <LinkHead progress={progressOf(share.tasks)} share={manager} title={share.project.name} writable={can['tab:write']} />
      <LinkTaskList folders={share.folders} showFolders={mayReach(share.role, share.scope, 'project:read', 'folder')} tasks={share.tasks} token={token} />
    </div>
  )
}
