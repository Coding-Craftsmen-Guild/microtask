import { orNoAnswer } from '@repo/app-session/no-answer'
import type { Answer } from '../canvas/extend-write'
import type { DrawGesture, RailGesture } from '../store/gestures'
import type { AimTarget } from './create-aim'
import { CREATE_NAMES } from './create-kinds'

/**
 * Every write a drop on the board can make.
 *
 * A feature dropped from the strip and a feature drawn from a mark's end are the same piece of work made
 * two ways, so both are the one {@link DrawGesture}; a new rail is the {@link RailGesture}. Both are a
 * single change in the plan store — on screen whole the moment the drop lands, persisted as a chain behind
 * it (`../store/gestures.ts`, ADR 0069). Moving an existing rail is one write and is the optimistic
 * `reorderEpic`. Each is `null` where this surface may not make it.
 */
export interface CreateWrites {
  readonly draw: DrawGesture | null
  readonly dropRail: RailGesture | null
  readonly reorderEpic: ((planId: string, epicId: string, railOrder: number) => Answer) | null
}

/** One drop: the plan, the writes this surface holds, and the hue a new rail would take. */
export interface DropContext {
  /** The plan every write is addressed at. */
  readonly planId: string

  readonly writes: CreateWrites

  /** The hue the server proposed for the next rail. */
  readonly colour: string
}

/**
 * What a release on the board writes.
 *
 * Four kinds of drop and three paths: a new rail is the rail gesture, an existing rail is the reorder
 * alone, and everything else is a piece of work, which the draw gesture already knows how to make.
 * Sharing that path is what makes a feature dropped after another one carry the dependency and the group,
 * which is the same thing a feature drawn from that feature's end does.
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
  const { draw, dropRail, reorderEpic } = context.writes
  if (target.kind === 'epic') {
    return dropRail === null ? null : dropRail({ name: CREATE_NAMES.epic, colour: context.colour }, target.gap)
  }
  if (target.kind === 'rail') {
    if (reorderEpic !== null && target.epicId !== '') await orNoAnswer(reorderEpic)(context.planId, target.epicId, target.gap)
    return null
  }
  if (target.kind === 'work' && draw !== null) await draw(target.draft)
  return null
}
