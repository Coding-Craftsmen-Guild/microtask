import type { RailBox } from '@repo/canvas'
import { describe, expect, it } from 'vitest'
import { LAYOUT } from '../canvas/view'
import { featureAt, gapAt, gapY, laneAt, laneY, sprintAt } from './create-drop'

const bar = (id: string, startDay: number, endDay: number) => ({
  id,
  startDay,
  endDay,
  x: startDay * 14,
  width: (endDay - startDay) * 14,
})

const rail = (...bars: readonly ReturnType<typeof bar>[]): RailBox => ({
  epicId: 'EP1',
  colour: '#3355ff',
  featureIds: bars.map((one) => one.id),
  bars,
})

const LANE = LAYOUT.railHeight

describe('which lane a drop is on', () => {
  it('floors, because a lane is a band and a point is inside exactly one of them', () => {
    expect(laneAt(0, 3)).toBe(0)
    expect(laneAt(LANE - 1, 3)).toBe(0)
    expect(laneAt(LANE, 3)).toBe(1)
    expect(laneAt(LANE * 2.9, 3)).toBe(2)
  })

  // Not the last lane. A drop below the plan is a drop on the page, and answering it with the bottom
  // rail would put work on a rail nobody pointed at.
  it('answers nothing past the last lane, and nothing above the first', () => {
    expect(laneAt(LANE * 3, 3)).toBeNull()
    expect(laneAt(-1, 3)).toBeNull()
    expect(laneAt(0, 0)).toBeNull()
  })
})

describe('which gap a new rail goes in', () => {
  // A **round** where the lane floors, and that difference is the whole of what a rail drop is: a
  // feature lands on a lane and an epic lands between two.
  it('rounds to the nearest boundary, so the top half of a lane inserts above it', () => {
    expect(gapAt(0, 3)).toBe(0)
    expect(gapAt(LANE * 0.4, 3)).toBe(0)
    expect(gapAt(LANE * 0.6, 3)).toBe(1)
    expect(gapAt(LANE * 1.5, 3)).toBe(2)
  })

  it('clamps to the ends, a drop above the first inserting at the top and below the last appending', () => {
    expect(gapAt(-500, 3)).toBe(0)
    expect(gapAt(LANE * 99, 3)).toBe(3)
  })

  it('draws its line at the boundary it names, which is where the rail will open', () => {
    expect(gapY(0)).toBe(0)
    expect(gapY(2)).toBe(LANE * 2)
    expect(laneY(2)).toBe(gapY(2))
  })
})

describe('which feature a drop is inside', () => {
  const lane = rail(bar('F1', 0, 4), bar('F2', 4, 7))

  it('is half-open on the right, so a point on a boundary is in the feature that opens there', () => {
    expect(featureAt(lane, 0)?.id).toBe('F1')
    expect(featureAt(lane, 3)?.id).toBe('F1')
    expect(featureAt(lane, 4)?.id).toBe('F2')
    expect(featureAt(lane, 6)?.id).toBe('F2')
  })

  it('answers nothing on bare lane, which is what the red refusal is drawn for', () => {
    expect(featureAt(lane, 7)).toBeNull()
    expect(featureAt(lane, -1)).toBeNull()
    expect(featureAt(rail(), 0)).toBeNull()
  })

  // A feature with no estimate has no bar, occupies no days, and cannot be the thing a pointer is
  // over — so the search reads the drawn bars and never `featureIds`.
  it('reads the drawn bars and not the rail’s whole list of features', () => {
    const unsized: RailBox = { ...rail(bar('F1', 0, 4)), featureIds: ['F1', 'F2'] }
    expect(featureAt(unsized, 5)).toBeNull()
  })
})

describe('which sprint a dropped day pins to', () => {
  it('floors the day by the plan’s own sprint length, counting from zero as the API does', () => {
    expect(sprintAt(0, 10)).toBe(0)
    expect(sprintAt(9, 10)).toBe(0)
    expect(sprintAt(10, 10)).toBe(1)
    expect(sprintAt(25, 10)).toBe(2)
  })

  // The canvas is bled and the axis origin is the plan's own first working day, so a drop really can
  // land left of day zero. A negative pin is not a sprint.
  it('floors at sprint zero for a drop left of the plan’s first day', () => {
    expect(sprintAt(-1, 10)).toBe(0)
    expect(sprintAt(-40, 10)).toBe(0)
  })
})
