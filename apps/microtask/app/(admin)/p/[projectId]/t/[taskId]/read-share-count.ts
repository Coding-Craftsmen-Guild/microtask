import { adminCall } from '../../../../../../actions/result'
import { taskPagePath } from '../../../../../../components/projects/paths'
import { scopedToTask } from '../../../../../../components/share-manager/task-share'

/**
 * How many share links are scoped to this task, for the count beside the task page's Share.
 *
 * The API answers the links with their tokens; this reduces them to a **number** on the server,
 * so the page is handed nothing a token could be read out of — the reason the project page
 * renders a count too (ADR 0033). The dialog asks for the links when it is opened.
 *
 * `undefined`, and not a zero, when the links could not be read: the manager then says nothing,
 * which is also what it says to a caller who may not list them. An expired admin is sent to
 * sign in and back to this task, as every read on this page does.
 */
export async function readShareCount(projectId: string, taskId: string): Promise<number | undefined> {
  const result = await adminCall(taskPagePath(projectId, taskId), async (api) => {
    const { shareLinks } = await api.shareLinks.list(projectId)
    return shareLinks.filter((link) => scopedToTask(link.scope, taskId)).length
  })
  return result.ok ? result.value : undefined
}
