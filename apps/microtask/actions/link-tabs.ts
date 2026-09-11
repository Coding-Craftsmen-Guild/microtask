'use server'

import type { TabRef, TaskRef } from '@repo/api-client'
import { linkCall } from './link-call'
import { flattened, type ActionResult } from './result'
import { checkedTabOrder } from './tab-order'
import type { TabValue } from './tabs'

/**
 * Creates a tab at the end of the task, with the authority of `token`, and answers it.
 *
 * The first argument of every action in this file is the share token, which the link page binds
 * in from its own URL. It is the credential, not a claim about one: a browser that sends another
 * token gets exactly that token's power, which it could have had by opening its URL (ADR 0040).
 * The API decides every call from the link's role and scope, so a `view` link is refused here
 * with the same 403 it would get anywhere.
 */
export async function createLinkTab(token: string, ref: TaskRef, name: string): Promise<ActionResult<TabValue>> {
  return linkCall(token, (api) => api.tabs.create(ref, name))
}

/** Renames a tab with the authority of `token`, answering the tab and the stamp the rename moved. */
export async function renameLinkTab(token: string, ref: TabRef, name: string): Promise<ActionResult<TabValue>> {
  return linkCall(token, (api) => api.tabs.rename(ref, name))
}

/** Deletes a tab with the authority of `token`; the API refuses it to anything short of `manage`. */
export async function deleteLinkTab(token: string, ref: TabRef): Promise<ActionResult<null>> {
  return linkCall(token, async (api) => {
    await api.tabs.remove(ref)
    return null
  })
}

/** Renumbers the task's tabs with the authority of `token`, checked against a fresh read first (`checkedTabOrder`). */
export async function reorderLinkTabs(
  token: string,
  ref: TaskRef,
  tabIds: readonly string[],
): Promise<ActionResult<readonly TabValue[]>> {
  return flattened(await linkCall(token, (api) => checkedTabOrder(api, ref, tabIds)))
}
