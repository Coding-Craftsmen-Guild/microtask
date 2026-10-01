import type { NewEpic, NewFeature, NewItem, Plan } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import type { AimTarget } from './create-aim'
import { CREATE_NAMES, DROPPED_ESTIMATE } from './create-kinds'

type Answer = Promise<ActionResult<Plan>>

/**
 * The four writes a drop can make, each `null` where this viewer may not make it.
 *
 * Four flat members and not a `PlanEditActions`, which is the rule the boundary states: a client
 * component may be handed primitives, unbound functions and `null`, and seventeen writes reachable
 * from a drop handler is sixteen more than it has any business with — the argument
 * `drawer/field.ts` makes for `SubjectWrite`, at the size this gesture actually needs.
 *
 * `reorderEpic` is here beside `createEpic` because the create route has no position in it: a rail is
 * appended, and the drop is about **where**. So an epic drop is two calls and says so, rather than a
 * create that quietly lands somewhere other than where the line was drawn.
 */
export interface CreateWrites {
  readonly createEpic: ((planId: string, epic: NewEpic) => Answer) | null

  readonly reorderEpic: ((planId: string, epicId: string, railOrder: number) => Answer) | null

  readonly createFeature: ((planId: string, feature: NewFeature) => Answer) | null

  readonly createItem: ((planId: string, item: NewItem) => Answer) | null
}

/** Everything a drop needs beyond where it landed: which plan, what it may write, and a hue. */
export interface DropContext {
  readonly planId: string

  readonly writes: CreateWrites

  /** The hue to propose for a new rail, chosen on the server from how many the plan holds. */
  readonly colour: string
}

const railAdded = (answer: ActionResult<Plan>): string | null =>
  answer.ok ? (answer.value.epics.at(-1)?.id ?? null) : null

const addEpic = async (gap: number, context: DropContext): Promise<void> => {
  const { createEpic, reorderEpic } = context.writes
  if (createEpic === null) return
  const made = await orNoAnswer(createEpic)(context.planId, {
    name: CREATE_NAMES.epic,
    colour: context.colour,
  })
  const added = railAdded(made)
  if (added === null || reorderEpic === null) return
  await orNoAnswer(reorderEpic)(context.planId, added, gap)
}

/**
 * Makes whatever a drop landed on, through the actions the surface handed in.
 *
 * ### Why a feature is pinned to the sprint it was dropped in
 *
 * A pin is a **floor** and never a date: it can delay a feature and can never move one earlier. So
 * pinning to the dropped sprint says exactly what the gesture meant — *not before here* — and the
 * schedule still has the last word about where the bar lands. Dropping in a sprint earlier than the
 * rail's own next free day is therefore a no-op on the position rather than a contradiction, which is
 * the behaviour a reader gets anyway and the one the pin field already documents.
 *
 * ### Why a dropped feature gets an item and an estimate
 *
 * A feature with no estimate has no bar: it lands in the unscheduled tray, which is the one place a
 * reader who has just dropped something onto the board will not look for it. The estimate is on the
 * **feature** and the item carries the same number, which is the shape `estimateFeature` and
 * `createItem` already produce between them — a feature's own estimate is what the forward pass uses
 * until its children outweigh it (ADR 0051).
 *
 * ### Why nothing is written for a refused aim
 *
 * The caller checks `refused` before reaching here, and `none` is handled anyway: a drop with nowhere
 * to land writes nothing at all rather than guessing at a nearest rail. §6's rule — "there is no
 * packing algorithm and nothing is ever auto-moved" — applies as much to a thing being made as to one
 * being dragged.
 *
 * @param target - What the aim resolved to.
 * @param context - The plan, what may be written, and the hue for a new rail.
 */
export async function writeDrop(target: AimTarget, context: DropContext): Promise<void> {
  const { createFeature, createItem } = context.writes
  if (target.kind === 'epic') return addEpic(target.gap, context)
  if (target.kind === 'feature') {
    if (createFeature === null) return
    await orNoAnswer(createFeature)(context.planId, {
      epicId: target.epicId,
      name: CREATE_NAMES.feature,
      estimateDays: DROPPED_ESTIMATE,
      pinSprint: target.sprint,
    })
    return
  }
  if (target.kind === 'item' && createItem !== null) {
    await orNoAnswer(createItem)(context.planId, {
      featureId: target.featureId,
      name: CREATE_NAMES.item,
      estimateDays: DROPPED_ESTIMATE,
    })
  }
}
