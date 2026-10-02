import type { NewEpic, Plan } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import { writeDraw, type ExtendWrites } from '../canvas/extend-write'
import type { AimTarget } from './create-aim'
import { CREATE_NAMES } from './create-kinds'

type Answer = Promise<ActionResult<Plan>>

/**
 * Every write a drop on the board can make.
 *
 * It is {@link ExtendWrites} plus the two about rails, and that is not a coincidence: a feature dropped
 * from the strip and a feature drawn from a mark's end are the same piece of work made two ways, so they
 * end in the same five calls. Only a rail is this record's own — nothing is ever *drawn* into a rail.
 */
export interface CreateWrites extends ExtendWrites {
  /** Add a rail to the plan. */
  readonly createEpic: ((planId: string, epic: NewEpic) => Answer) | null

  /** Move a rail to a position among the others. */
  readonly reorderEpic: ((planId: string, epicId: string, railOrder: number) => Answer) | null
}

/** One drop: the plan, the writes this surface holds, and the hue a new rail would take. */
export interface DropContext {
  /** The plan every write is addressed at. */
  readonly planId: string

  /** The actions, each `null` where this surface may not make it. */
  readonly writes: CreateWrites

  /** The next hue in the palette, which a new rail is created with. */
  readonly colour: string
}

const railAdded = (answer: ActionResult<Plan>): string | null =>
  answer.ok ? (answer.value.epics.at(-1)?.id ?? null) : null

const addEpic = async (gap: number, context: DropContext): Promise<string | null> => {
  const { createEpic, reorderEpic } = context.writes
  if (createEpic === null) return null
  const made = await orNoAnswer(createEpic)(context.planId, {
    name: CREATE_NAMES.epic,
    colour: context.colour,
  })
  const added = railAdded(made)
  if (added === null) return null
  if (reorderEpic !== null) await orNoAnswer(reorderEpic)(context.planId, added, gap)
  return added
}

const moveRail = async (epicId: string, gap: number, context: DropContext): Promise<void> => {
  const { reorderEpic } = context.writes
  if (reorderEpic === null || epicId === '') return
  await orNoAnswer(reorderEpic)(context.planId, epicId, gap)
}

/**
 * What a release on the board writes.
 *
 * Four gestures and three paths: a new rail is a create and then a move, because the route appends and the
 * line was drawn somewhere; an existing rail is the move alone; and everything else is a piece of work,
 * which `canvas/extend-write.ts` already knows how to make. Sharing that path is what makes a feature
 * dropped after another one carry the dependency and the group, which is the same thing a feature drawn
 * from that feature's end does.
 *
 * A step this surface may not take is skipped rather than refusing the drop: a reader who may create a rail
 * but not reorder one gets it at the bottom, which is the honest outcome of what they hold.
 *
 * A dropped **rail** is the one case that answers something: its id, so the board can open the panel
 * where it is named. Nothing else needs opening — a feature or an item dropped on the board is already
 * where it was dropped, and a rail arrives called `New epic` with nothing on it.
 *
 * @param target - What the aim said this release would do.
 * @param context - The plan, the writes and the palette.
 * @returns The new rail's id, or `null` for every other kind of drop.
 */
export async function writeDrop(target: AimTarget, context: DropContext): Promise<string | null> {
  if (target.kind === 'epic') return addEpic(target.gap, context)
  if (target.kind === 'rail') {
    await moveRail(target.epicId, target.gap, context)
    return null
  }
  if (target.kind === 'none') return null
  await writeDraw({ ...target.draft, planId: context.planId }, context.writes)
  return null
}
