import { orNoAnswer } from '@repo/app-session/no-answer'
import { splitEdges, type SubjectWrite } from './field'
import { edgesOf } from './values'

const sent = new Map<string, readonly string[]>()

let pending = 0

const keyOf = (planId: string, featureId: string): string => `${planId} ${featureId}`

const settle = (key: string, edges: readonly string[]): void => {
  pending -= 1
  if (pending === 0) sent.set(key, edges)
}

/**
 * One click on one candidate's box: where the write goes, and both refusals the row was handed.
 *
 * Both, because which of the two a click means is decided **here** and not on the server: the row
 * that was rendered unticked is the row an earlier click may already have ticked, so a row carrying
 * one list and one refusal could only ever answer the first click made on it (see {@link
 * toggleEdge}). Each is a string rather than a list for the reason `./field.ts`'s codec exists — a
 * client component may be handed primitives, an unbound function or `null` and nothing else
 * (`../module-boundaries.test.tsx`).
 */
export interface EdgeClick {
  /** The plan the write is addressed at, and half of the key the running list is held under. */
  readonly planId: string

  /** The feature whose whole list is being replaced, and the other half of that key. */
  readonly featureId: string

  /** The candidate this box is about, which is the one id the click adds or removes. */
  readonly candidateId: string

  /** The subject's list **as the render that drew this row found it**, joined. */
  readonly storedIds: string

  /** Why adding this candidate would be refused, worked out on the server, or `''`. */
  readonly addRefusal: string

  /** Why removing it would be refused — a cycle the plan already holds refuses either — or `''`. */
  readonly removeRefusal: string

  /** Replaces the subject's whole list and answers the plan, or why it was refused. */
  readonly write: SubjectWrite<readonly string[]>
}

/** What the box and the line under it should say once a click has been answered. */
export interface EdgeAnswer {
  /** Where the box belongs: ticked while the edge is one this browser knows to be stored. */
  readonly ticked: boolean

  /** The refusal to show under it, or `''` when there is nothing to say. */
  readonly problem: string
}

/**
 * Drops the running list, which the render carrying a newer stored one has replaced.
 *
 * Called by every row when its `storedIds` changes, which is the one signal a row has that the
 * server's answer has come back around as props: `adminWrite` calls `refresh()` on success, so the
 * route re-renders and every row is re-propped from the plan the server now holds. Dropping it then
 * is what keeps this module from outliving its usefulness — a list nobody replaced would go on
 * overriding a render that already knows better, including a render that reflects **another**
 * editor's write.
 *
 * It keeps the list while a write is still out, because a render can land between two clicks: the
 * props then reflect the first write and not the second, and forgetting would rebuild the next click
 * from a list one edge behind.
 *
 * @param planId - The plan the editor is writing to.
 * @param featureId - The feature whose list it edits.
 */
export const forgetEdges = (planId: string, featureId: string): void => {
  if (pending === 0) sent.delete(keyOf(planId, featureId))
}

/**
 * Sends the click: the whole list this browser now means, and where the box and the line belong.
 *
 * ### The list is built here, from what this browser has sent, and not on the server
 *
 * `PUT .../dependencies` replaces the whole set, so every click sends the subject's entire list —
 * and the list a click has to start from is the list the **last** click sent, not the one the render
 * found. A server-built snapshot per row cannot be that: every row of one render is built from the
 * same pre-write list, so on a feature with no edges a click on *Billing* sends `[Billing]` and a
 * click on *Reporting* before the re-render lands sends `[Reporting]`, which replaces the edge just
 * stored. That is one request wide, but two quick ticks on a checkbox list is the ordinary way to
 * use one, and nothing detected it or reported it. The loss was per **render** and not per person:
 * one user, one screen, two clicks.
 *
 * So the list lives here instead, keyed by plan and feature, and is written **before** the await:
 * a second click made while the first is still out is built from the list the first is sending. It
 * is seeded from the row's own `storedIds` — the render's own reading of the plan — so a first click
 * on a fresh render sends exactly what the server last confirmed, and it is dropped again by {@link
 * forgetEdges} as soon as a render arrives carrying that answer.
 *
 * A write that is answered while nothing else is out replaces the running list with **the plan's
 * own** ({@link edgesOf}), so a list the API deduped or reordered is what the next click builds on;
 * a refused one puts back the list from before the click. Neither happens while another write is
 * still out, that write having already built on the newer list.
 *
 * ### The refusals are the render's, and the sound half of that is the one that matters
 *
 * `addRefusal` was worked out against the list the render found, so a click made after another has
 * landed is judged against a list one edge short. For a **cycle** that is still sound rather than
 * lucky: every cycle through the subject leaves it by one of its own edges, so a cycle in
 * `own + x + y` is already a cycle in `own + x` or in `own + y` — an empty `addRefusal` stays empty
 * for the pair. A removal closes nothing, so `removeRefusal` can only be the plan's own standing
 * cycle. The plan-wide **budget** is the one that can be stale in the permissive direction, by the
 * number of unconfirmed adds; that write reaches the API and is refused there, which is the
 * arrangement the whole control already rests on — the local check is a message and the API is the
 * authority.
 *
 * @param click - The row's own strings, and the write to send them with.
 * @returns Where to paint the box, and what to say under it.
 */
export async function toggleEdge(click: EdgeClick): Promise<EdgeAnswer> {
  const key = keyOf(click.planId, click.featureId)
  const edges = sent.get(key) ?? splitEdges(click.storedIds)
  const ticked = edges.includes(click.candidateId)
  const refusal = ticked ? click.removeRefusal : click.addRefusal
  if (refusal !== '') return { problem: refusal, ticked }
  const next = ticked ? edges.filter((id) => id !== click.candidateId) : [...edges, click.candidateId]
  sent.set(key, next)
  pending += 1
  const result = await orNoAnswer(click.write)(click.planId, click.featureId, next)
  if (!result.ok) {
    settle(key, edges)
    return { problem: result.detail, ticked }
  }
  const stored = edgesOf(result.value, click.featureId)
  settle(key, stored)
  return { problem: '', ticked: stored.includes(click.candidateId) }
}
