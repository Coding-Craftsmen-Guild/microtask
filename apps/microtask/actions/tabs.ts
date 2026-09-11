'use server'

import type { Decoded, TabRef, TaskRef } from '@repo/api-client'
import type { Tab } from '@repo/contracts'
import { taskPagePath } from '../components/projects/paths'
import { adminCall, flattened, type ActionResult } from './result'
import { checkedTabOrder } from './tab-order'

/** One tab as the API answers it, document and stamp included. */
export type TabValue = Decoded<typeof Tab>

const pageOf = (ref: TaskRef): string => taskPagePath(ref.projectId, ref.taskId)

/**
 * Creates a tab at the end of the task and answers it, so the page can open it.
 *
 * None of the tab actions refreshes the router, unlike their siblings in this directory: the task
 * page applies each answer to the tabs it holds, and a refresh would ship every tab's document
 * to the browser again to tell it what the answer already said.
 */
export async function createTab(ref: TaskRef, name: string): Promise<ActionResult<TabValue>> {
  return adminCall(pageOf(ref), (api) => api.tabs.create(ref, name))
}

/**
 * Renames a tab and answers the tab the server stored.
 *
 * The whole tab rather than the name, because a rename moves the tab's `updatedAt` — the stamp
 * a document write presents as `If-Match` — and a page that kept the old one would take its own
 * next save for somebody else's (ADR 0016).
 */
export async function renameTab(ref: TabRef, name: string): Promise<ActionResult<TabValue>> {
  return adminCall(pageOf(ref), (api) => api.tabs.rename(ref, name))
}

/** Deletes a tab. The API refuses a task's last one, and that refusal comes back to be shown. */
export async function deleteTab(ref: TabRef): Promise<ActionResult<null>> {
  return adminCall(pageOf(ref), async (api) => {
    await api.tabs.remove(ref)
    return null
  })
}

/** Renumbers the task's tabs into the order given and answers them in it (`checkedTabOrder`). */
export async function reorderTabs(
  ref: TaskRef,
  tabIds: readonly string[],
): Promise<ActionResult<readonly TabValue[]>> {
  return flattened(await adminCall(pageOf(ref), (api) => checkedTabOrder(api, ref, tabIds)))
}
