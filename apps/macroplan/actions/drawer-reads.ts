'use server'

import type { BoundTasks, MacroplanSessionClient } from '@repo/api-client'
import { planPath } from '../lib/routes'
import { linkCall } from './link-call'
import { adminCall, type ActionResult } from './result'

/** What an item's drawer reads when it opens: what the plan the browser holds does not carry. */
export interface ItemDrawerRead {
  /** The item's description, which lives in its own file rather than in the manifest. */
  readonly description: string

  /** The tasks its rail's project holds, for the link picker, or `null` where there are none to offer. */
  readonly tasks: BoundTasks | null
}

const tasksOf = async (api: MacroplanSessionClient, planId: string, epicId: string | null): Promise<BoundTasks | null> =>
  epicId === null ? null : api.epics.tasks(planId, epicId).catch(() => null)

/**
 * An item's description and its rail's task list, for the admin drawer that has just opened on it.
 *
 * These were read by the item drawer's own page, on the server, on every open (`i/[itemId]/page.tsx`
 * before ADR 0069). The drawer is drawn in the browser now, from the plan it already holds, so the two
 * things that plan does not carry are fetched here, once, while the panel is already on screen.
 *
 * The task list is the picker's and fails soft, exactly as `read-bound-tasks.ts` did: the route answers
 * **409** for a rail bound to nothing, which is the ordinary case, and a picker that cannot be filled must
 * cost the picker and not the drawer. The item read does not fail soft — a refusal is answered as one, and
 * the drawer says it — but it is never `notFound()`, which inside an action would be a navigation.
 *
 * `epicId` is the rail the browser worked out the item sits under; it is a target for the API to judge
 * (`epic:bind`, admin-only), never proof of anything.
 *
 * @param planId - The plan.
 * @param itemId - The item.
 * @param epicId - Its rail, or `null` when the browser could not name one.
 * @returns The description and the tasks, or the refusal.
 */
export async function readItemDrawer(
  planId: string,
  itemId: string,
  epicId: string | null,
): Promise<ActionResult<ItemDrawerRead>> {
  return adminCall(planPath(planId), async (api) => {
    const [item, tasks] = await Promise.all([api.plans.readItem(planId, itemId), tasksOf(api, planId, epicId)])
    return { description: item.description, tasks }
  })
}

/**
 * An item's description, for a seat's drawer — through the seat's own token, and never a task list.
 *
 * A seat is not offered the bound project's tasks (ADR 0052: a list of every task is more than any seat is
 * granted), so it reads the description alone; `tasks` is always `null` here.
 *
 * @param token - The share token in the seat's address, which is the whole credential.
 * @param planId - The plan.
 * @param itemId - The item.
 * @returns The description, or the refusal.
 */
export async function seatReadItemDrawer(
  token: string,
  planId: string,
  itemId: string,
): Promise<ActionResult<ItemDrawerRead>> {
  return linkCall(token, async (api) => ({ description: (await api.plans.readItem(planId, itemId)).description, tasks: null }))
}
