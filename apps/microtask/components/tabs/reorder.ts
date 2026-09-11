import { moved } from '../shared/moved'

/** Which neighbour a tab trades places with. */
export type MoveDirection = 'left' | 'right'

/**
 * The whole order after moving one tab a step, or `null` when there is nowhere to move it.
 *
 * The tab strip's Move left and Move right, spelled as the one step {@link moved} computes for
 * every reorder in this app, so the tree and the strip cannot disagree about what a step is.
 */
export const movedOrder = (ids: readonly string[], id: string, direction: MoveDirection): readonly string[] | null =>
  moved(ids, id, direction === 'left' ? -1 : 1)
