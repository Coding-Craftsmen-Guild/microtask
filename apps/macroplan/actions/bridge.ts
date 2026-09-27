'use server'

import type { BoundProject, NewBinding, Plan } from '@repo/api-client'
import { adminWrite } from './plan-write'
import type { ActionResult } from './result'

/**
 * Binds one rail to a Microtask project by the share token an admin pasted from there.
 *
 * Takes the whole {@link NewBinding} rather than a token and a role beside it, for the reason
 * `createEpic` takes a whole `NewEpic`: the body is what the wire carries, and both fields are
 * required, so a caller assembling it positionally would only be spelling the same object twice.
 *
 * **The token crosses this boundary in plaintext and that is unavoidable** — it is what the admin
 * typed, and only the API can seal it. What matters is where it stops: the API seals it before storing
 * it, and no response ever carries it back, so it exists in the clear for exactly one request. A
 * Server Action is the narrowest place to put that: the value never reaches a client component, never
 * lands in a Flight payload, and never becomes part of a URL.
 */
export async function bindEpic(
  planId: string,
  epicId: string,
  binding: NewBinding,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.bind(planId, epicId, binding))
}

/**
 * Binds one rail to a named Microtask project, the API minting and sealing the seat itself.
 *
 * ### The action with no credential in it
 *
 * {@link bindEpic} beside this one carries a token in plaintext across the boundary, which is unavoidable
 * there — it is what the admin typed, and only the API can seal it. This one carries a **project id**, which
 * is not a secret: it is in the URL of every page of that project in Microtask. So the clear-text window that
 * action documents does not exist on this path at all; the credential is created inside the API and never
 * leaves it.
 *
 * That is what makes this the one to offer first. `bindEpic` stays for the case this cannot serve — binding a
 * project in a Microtask the admin holds no session for — which is why neither replaces the other.
 *
 * ### It needs two authorities and asks the API for both
 *
 * `epic:bind` on the plan and `share:create` on the project. The second is the one worth naming here: this
 * action can only bind a project the caller could already have shared by hand, so it is a shortcut and not a
 * permission. A caller who could not mint there is refused, with the API answering rather than this file
 * deciding.
 */
export async function bindEpicProject(
  planId: string,
  epicId: string,
  binding: BoundProject,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.bindProject(planId, epicId, binding))
}

/**
 * Unbinds one rail, leaving every item's link in place.
 *
 * Answers the plan, like every write here, because unbinding changes what the whole timeline reports:
 * every item under the rail stops having a counted number, so every bar on it is drawn from its
 * estimate alone again.
 */
export async function unbindEpic(planId: string, epicId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.unbind(planId, epicId))
}

/**
 * Links one item to a task that already exists in its rail's bound project.
 *
 * Named for the authority it needs — `item:link`, a `write` grant — rather than for the client method,
 * as every action in this directory is. The task id is a value the caller chose from the rail's own
 * task list, and the API checks it against that project again rather than trusting it.
 */
export async function linkItem(
  planId: string,
  itemId: string,
  taskId: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.link(planId, itemId, { taskId }))
}

/** Unlinks one item from its task. Idempotent, and it needs no live binding to clear the field. */
export async function unlinkItem(planId: string, itemId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.unlink(planId, itemId))
}

/**
 * Creates the real task in the bound project, named after the item, and links the item to it.
 *
 * The one write this product makes into the other one (design §7.2), and the only action in this
 * directory whose failure can leave something behind: the API creates the task before it writes the
 * link, cannot roll back — the bridge is permitted no delete — and so a failure between the two leaves
 * a named task in Microtask with nothing pointing at it. A caller sees the refusal and the item
 * unlinked; what it must not do is retry blindly, because the API answers 409 for an item that *is*
 * linked precisely so that a retry cannot make a second task, and a 409 here means the first attempt
 * landed after all.
 */
export async function createTask(planId: string, itemId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.createTask(planId, itemId))
}
