'use server'

import type { Decoded, TabRef, TaskRef } from '@repo/api-client'
import type { Tab } from '@repo/contracts'
import { taskPagePath } from '../components/projects/paths'
import { isPermutationOf, STALE_ORDER } from './permutation'
import { adminCall, flattened, rejected, type ActionResult } from './result'

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

/**
 * Renumbers the task's tabs into the order given and answers them in it.
 *
 * Checked against a **fresh read** of the task and refused unless it names each tab exactly
 * once, as every reorder in this directory is: an order built from a stale page leaves out the
 * tab somebody else just added, and the API stays the gate behind this check either way.
 */
export async function reorderTabs(
  ref: TaskRef,
  tabIds: readonly string[],
): Promise<ActionResult<readonly TabValue[]>> {
  return flattened(
    await adminCall(pageOf(ref), async (api): Promise<ActionResult<readonly TabValue[]>> => {
      const { tabs } = await api.tasks.read(ref)
      if (!isPermutationOf(tabs.map((tab) => tab.id), tabIds)) return rejected(409, STALE_ORDER)
      const ordered = await api.tabs.reorder(ref, tabIds)
      return { ok: true, value: ordered.tabs }
    }),
  )
}
