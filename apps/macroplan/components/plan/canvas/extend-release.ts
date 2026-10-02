import type { Board, Hovered } from './extend-dom'
import { beforeOn } from './extend-dom'
import { aimOf, draftOf, type Drawn, type DrawnAt, type DrawnSide } from './extend-view'
import { writeDraw, type ExtendWrites } from './extend-write'
import { sizeDraftOfMark } from './size-view'
import { writeSize, type SizeWrites } from './size-write'

/** A drag in progress: the mark it began on, the handle, where the pointer is, and which gesture it is. */
export interface Drawing {
  readonly from: Hovered

  readonly side: DrawnSide

  readonly at: DrawnAt

  /** Whether it resizes the mark it began on, rather than drawing new work beside it. */
  readonly sizing: boolean
}

/** The drag as `./extend-view.ts` wants it: the same facts, under the names that module uses. */
export const drawnOf = (drawing: Drawing): Drawn => ({
  epicId: drawing.from.epicId,
  featureId: drawing.from.featureId,
  kind: drawing.from.kind,
  labelId: drawing.from.labelId,
  name: drawing.from.name,
  originDay: drawing.side === 'end' ? drawing.from.endDay : drawing.from.startDay,
  position: drawing.from.position,
  side: drawing.side,
  subjectId: drawing.from.subjectId,
})

/** Everything a release needs: the plan, the board it happened over, the drag, and both write sets. */
export interface Release {
  readonly planId: string

  readonly board: Board

  /** The drag, with the pointer already moved to where it was let go. */
  readonly drawing: Drawing

  readonly sprintLengthDays: number

  readonly writes: ExtendWrites

  readonly sizes: SizeWrites
}

/**
 * What letting go of a handle does: resize the mark, or create the work that was drawn beside it.
 *
 * The two branches are one function because they are one event — a release on a handle — and which of
 * them runs was decided when the drag began, by whether Ctrl was held (`./use-extend.ts`). Keeping that
 * decision here rather than in the hook is what lets the hook hold state and nothing else.
 *
 * Neither branch can write without the action it needs, and neither refuses the gesture for want of one:
 * `./extend-write.ts` skips the steps a surface may not take, and `./size-write.ts` writes nothing at
 * all where the one call it needs is absent. A drag that would change nothing — a resize back to the
 * length the mark already had — writes nothing either.
 *
 * @param release - The plan, the board, the drag and the writes.
 */
export function releaseDraw(release: Release): void {
  const { planId, board, drawing, sprintLengthDays, writes, sizes } = release
  if (drawing.sizing) {
    const draft = sizeDraftOfMark(drawing.from, drawing.side, drawing.at.day, sprintLengthDays)
    if (draft !== null) void writeSize(planId, draft, sizes)
    return
  }
  const drawn = drawnOf(drawing)
  const aim = aimOf(drawn, drawing.at, sprintLengthDays)
  const where = { ...drawing.at, before: beforeOn(board.rails, drawing.at.lane, aim.fromDay) }
  const draft = draftOf(drawn, aim, where, sprintLengthDays)
  if (draft !== null) void writeDraw({ ...draft, planId }, writes)
}
