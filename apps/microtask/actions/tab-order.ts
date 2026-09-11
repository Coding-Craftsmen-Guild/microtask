import type { TaskRef } from '@repo/api-client'
import type { SessionClient } from '../lib/api'
import { isPermutationOf, STALE_ORDER } from './permutation'
import { rejected, type ActionResult } from './result'
import type { TabValue } from './tabs'

/**
 * Renumbers a task's tabs into the order given, checked against a **fresh read** of the task
 * first, and answers them in it.
 *
 * The body both surfaces' reorders share, run inside `adminCall` or `linkCall` with whichever
 * client the route resolved. An order built from a stale page leaves out the tab somebody else
 * just added, so it is refused here unless it names each tab exactly once, as every reorder in
 * this directory is; the API stays the gate behind the check either way, and refuses a reorder to
 * a link short of `manage`.
 */
export async function checkedTabOrder(
  api: SessionClient,
  ref: TaskRef,
  tabIds: readonly string[],
): Promise<ActionResult<readonly TabValue[]>> {
  const { tabs } = await api.tasks.read(ref)
  if (!isPermutationOf(tabs.map((tab) => tab.id), tabIds)) return rejected(409, STALE_ORDER)
  const ordered = await api.tabs.reorder(ref, tabIds)
  return { ok: true, value: ordered.tabs }
}
