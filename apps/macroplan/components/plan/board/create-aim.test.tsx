import { scaleFor, type DayRange } from '@repo/canvas'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanCanvas } from '../canvas/plan-canvas'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, LABEL_1 } from '../testing/plan-fixture'
import { aimedAt, type DropAxis } from './create-aim'
import { LAYOUT } from '../canvas/view'

const AT = new Date('2026-09-28T09:00:00.000Z')

const RANGE: DayRange = { fromDay: 0, toDay: 40 }

const SCALE = scaleFor({ pxPerDay: 14, gutter: 0 })

const AXIS: DropAxis = {
  calendar: { sprintLengthDays: 14, startDate: '2026-09-28', timezone: 'Europe/Belgrade' },
  railId: '',
  scale: SCALE,
}

const LANE_ONE = LAYOUT.railHeight / 2

// The fixture's one rail: `Auth rewrite` for days 0–5 with two items, then `Billing` after it.
const board = (rung: 'item' | 'feature' = 'item') => {
  render(
    <PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} range={RANGE} rung={rung} scale={SCALE} />,
  )
  const canvas = document.querySelector('[data-slot="plan-canvas"]')
  if (canvas === null) throw new Error('no canvas was drawn')
  return canvas
}

const dayAt = (day: number): number => day * SCALE.pxPerDay

const spanOf = (featureId: string): { readonly startDay: number; readonly endDay: number } => {
  const span = atlasPlan().schedule.spans.find((one) => one.id === featureId)
  if (span === undefined) throw new Error(`the fixture places no ${featureId}`)
  return span
}

describe('a rail dragged by its grip, and a new epic dropped between two', () => {
  it('both draw the same line at the gap the pointer is nearest', () => {
    const canvas = board()
    const epic = aimedAt('epic', { x: 100, y: 4 }, canvas, AXIS)
    const rail = aimedAt('rail', { x: 100, y: 4 }, canvas, { ...AXIS, railId: EPIC_1 })

    expect(epic.mark).toEqual({ shape: 'line', y: 0 })
    expect(rail.mark).toEqual(epic.mark)
  })

  it('says which one it is in the chip, the two writing different things', () => {
    const canvas = board()

    expect(aimedAt('epic', { x: 100, y: 4 }, canvas, AXIS).chip).toContain('New epic')
    expect(aimedAt('rail', { x: 100, y: 4 }, canvas, AXIS).chip).toContain('Move this rail')
  })

  it('carries the rail being dragged into the write, a drag type being unable to', () => {
    const aim = aimedAt('rail', { x: 100, y: 99 }, board(), { ...AXIS, railId: EPIC_1 })

    expect(aim.target).toEqual({ epicId: EPIC_1, gap: 1, kind: 'rail' })
  })
})

describe('a feature dropped near the end of another', () => {
  it('says it goes after that feature, by name', () => {
    const end = spanOf(FEATURE_1).endDay
    const aim = aimedAt('feature', { x: dayAt(end + 0.5), y: LANE_ONE }, board(), AXIS)

    expect(aim.chip).toContain('After')
    expect(aim.chip).toContain('Auth rewrite')
  })

  it('writes the dependency as well as the position, so the schedule orders the two', () => {
    const end = spanOf(FEATURE_1).endDay
    const aim = aimedAt('feature', { x: dayAt(end + 0.5), y: LANE_ONE }, board(), AXIS)

    expect(aim.target).toEqual({
      draft: expect.objectContaining({ edge: 'new-waits', featureId: FEATURE_1, kind: 'feature' }),
      kind: 'work',
    })
  })

  // The group is how a reader navigates the board, so work added after a feature belongs to the same
  // one. The fixture's first feature is in `Phase 1`.
  it('takes that feature’s group, which is what a reader is navigating by', () => {
    const end = spanOf(FEATURE_1).endDay
    const aim = aimedAt('feature', { x: dayAt(end + 0.5), y: LANE_ONE }, board(), AXIS)

    expect(aim.target).toEqual({
      draft: expect.objectContaining({ labelId: LABEL_1 }),
      kind: 'work',
    })
  })

  it('draws the box where the new feature will start, which is that feature’s end', () => {
    const end = spanOf(FEATURE_1).endDay
    const aim = aimedAt('feature', { x: dayAt(end + 0.5), y: LANE_ONE }, board(), AXIS)

    expect(aim.mark).toEqual(expect.objectContaining({ shape: 'box', x: dayAt(end) }))
  })
})

describe('a feature dropped on open rail', () => {
  const open = () => {
    const after = spanOf(FEATURE_2).endDay + 6
    return aimedAt('feature', { x: dayAt(after), y: LANE_ONE }, board(), AXIS)
  }

  it('says the rail and the date it would start on, a sprint number being no answer', () => {
    expect(open().chip).toContain('Platform')
    expect(open().chip).toMatch(/[0-9]{4}-[0-9]{2}-[0-9]{2}/)
  })

  it('pins the sprint it was dropped in and writes no dependency', () => {
    expect(open().target).toEqual({
      draft: expect.objectContaining({ edge: 'none', labelId: '', sprint: 1 }),
      kind: 'work',
    })
  })

  it('refuses a drop below every rail, which is a drop on the page', () => {
    const aim = aimedAt('feature', { x: 100, y: 4000 }, board(), AXIS)

    expect(aim.refused).toBe(true)
    expect(aim.chip).toBe('Drop on a rail')
    expect(aim.target).toEqual({ kind: 'none' })
  })
})

describe('an item dropped inside a feature', () => {
  it('lands at the gap between the items nearest the pointer, counted for a reader from 1', () => {
    const canvas = board()
    const first = aimedAt('item', { x: dayAt(0.2), y: LANE_ONE }, canvas, AXIS)
    const later = aimedAt('item', { x: dayAt(4.5), y: LANE_ONE }, canvas, AXIS)

    expect(first.target).toEqual({ draft: expect.objectContaining({ position: 0 }), kind: 'work' })
    expect(first.chip).toContain('position 1')
    expect(later.chip).not.toBe(first.chip)
  })

  it('names the feature it lands in, which is the one the pointer is over', () => {
    const aim = aimedAt('item', { x: dayAt(1), y: LANE_ONE }, board(), AXIS)

    expect(aim.chip).toContain('Auth rewrite')
  })

  it('draws a tick at the gap rather than a box over the feature', () => {
    const aim = aimedAt('item', { x: dayAt(1), y: LANE_ONE }, board(), AXIS)

    expect(aim.mark.shape).toBe('tick')
  })

  // Only a feature can hold an item, so a drop on the rail's empty days is refused and says why rather
  // than silently landing somewhere.
  it('refuses a drop outside every feature of that rail, and says so', () => {
    const past = spanOf(FEATURE_2).endDay + 6
    const aim = aimedAt('item', { x: dayAt(past), y: LANE_ONE }, board(), AXIS)

    expect(aim.refused).toBe(true)
    expect(aim.chip).toBe('Drop inside a feature')
  })

  // At the feature and epic rungs the items are not drawn, so there are no gaps to land between: the
  // position is the end of the feature, which is where an item added from anywhere else lands.
  it('appends where the rung draws no items, there being no gap on screen to choose', () => {
    const aim = aimedAt('item', { x: dayAt(1), y: LANE_ONE }, board('feature'), AXIS)

    expect(aim.target).toEqual({ draft: expect.objectContaining({ position: 0 }), kind: 'work' })
    expect(aim.refused).toBe(false)
  })
})
