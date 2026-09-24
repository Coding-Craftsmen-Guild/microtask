import { railsOf, schedule as forwardPass } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import type { CanvasPlan, CanvasSchedule } from './plan.js'
import type { FeatureBar, RailBox } from './rails.js'
import { railLayout } from './rails.js'
import { scaleFor, dayToX, widthOfDays } from './scale.js'

const E1 = 'epic-1'
const E2 = 'epic-2'
const E3 = 'epic-3'
const NO_SUCH_EPIC = 'epic-nobody-declared'

const FT1 = 'feature-1'
const MILESTONE = 'feature-2-milestone'
const NOEST = 'feature-3-unestimated'
const FT2 = 'feature-4'
const ORPHAN = 'feature-5-orphan-rail'
const AROUND_FIRST = 'feature-6'
const SKIPPED = 'feature-7-unestimated'
const AROUND_LAST = 'feature-8'

const IT1 = 'item-1'
const IT2 = 'item-2'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const feature = (
  id: string,
  epicId: string,
  position: number,
  estimateDays: number | null,
): CanvasPlan['features'][number] => ({
  id,
  epicId,
  position,
  estimateDays,
  pinSprint: null,
  dependsOn: [],
})

const PLAN: CanvasPlan = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [
    { id: E2, railOrder: 1, colour: '#3388ff' },
    { id: E1, railOrder: 0, colour: '#ff8833' },
    { id: E3, railOrder: 2, colour: '#33ff88' },
  ],
  features: [
    feature(ORPHAN, NO_SUCH_EPIC, 0, 2),
    feature(FT2, E2, 1, 3),
    feature(NOEST, E2, 0, null),
    feature(MILESTONE, E1, 1, 0),
    feature(FT1, E1, 0, 4),
    feature(AROUND_LAST, E3, 2, 3),
    feature(SKIPPED, E3, 1, null),
    feature(AROUND_FIRST, E3, 0, 4),
  ],
  items: [
    { id: IT2, featureId: FT1, position: 1, estimateDays: 2 },
    { id: IT1, featureId: FT1, position: 0, estimateDays: 2 },
  ],
}

const wireOf = (plan: CanvasPlan): CanvasSchedule => ({
  spans: [...forwardPass(plan).days].map(([id, span]) => ({
    id,
    startDay: span.startDay,
    endDay: span.endDay,
  })),
})

const WIRE = wireOf(PLAN)

const layout = (): readonly RailBox[] => railLayout(PLAN, WIRE, SCALE)

const bars = (): readonly FeatureBar[] => layout().flatMap((rail) => rail.bars)

function barFor(id: string): FeatureBar {
  const found = bars().find((bar) => bar.id === id)
  if (found === undefined) throw new Error(`no bar was laid out for ${id}`)
  return found
}

describe('railLayout turns a plan and its wire schedule into one box per rail', () => {
  it('orders rails the way the forward pass did, so a bar cannot land on the wrong rail', () => {
    expect(railLayout(PLAN, WIRE, SCALE).map((rail) => rail.epicId)).toEqual(
      railsOf(PLAN).map((features) => features[0]?.epicId),
    )
  })

  it('gives a feature with an unknown epicId a rail of its own, ordered last', () => {
    const rails = layout()
    expect(rails.map((rail) => rail.epicId)).toEqual([E1, E2, E3, NO_SUCH_EPIC])
    expect(rails.at(-1)?.bars.map((bar) => bar.id)).toEqual([ORPHAN])
  })

  it('takes a bar width from endDay minus startDay, because endDay is exclusive', () => {
    expect(barFor(FT1).width).toBe(widthOfDays(4, SCALE))
    expect(barFor(FT1).endDay - barFor(FT1).startDay).toBe(4)
  })

  it('draws a zero-day milestone at zero width, since a milestone has startDay === endDay', () => {
    const bar = barFor(MILESTONE)
    expect(bar.startDay).toBe(bar.endDay)
    expect(bar.width).toBe(0)
  })

  it('omits a feature with no span, because unscheduled is a different sentence from placed at zero', () => {
    expect(forwardPass(PLAN).unscheduled.map((one) => one.id)).toContain(NOEST)
    expect(bars().map((bar) => bar.id)).not.toContain(NOEST)
    expect(layout()[1]?.bars.map((bar) => bar.id)).toEqual([FT2])
  })

  it('places a bar at its start day, gutter included, rather than at the raw offset', () => {
    expect(barFor(MILESTONE).x).toBe(dayToX(4, SCALE))
    expect(barFor(FT1).x).toBe(SCALE.gutter)
  })

  it('never draws an item span as a feature bar, though spans carries both kinds in one array', () => {
    expect(WIRE.spans.map((span) => span.id)).toContain(IT1)
    expect(bars().map((bar) => bar.id)).toEqual([
      FT1,
      MILESTONE,
      FT2,
      AROUND_FIRST,
      AROUND_LAST,
      ORPHAN,
    ])
  })

  it('orders bars within a rail by (position, id), which is what railsOf already decided', () => {
    expect(layout()[0]?.bars.map((bar) => bar.id)).toEqual([FT1, MILESTONE])
    expect(railsOf(PLAN)[0]?.map((one) => one.id)).toEqual([FT1, MILESTONE])
  })
})

describe('a rail carries its whole feature order, not only the features that got a bar', () => {
  it('names every feature on the rail in the order railsOf derived, the unplaced ones included', () => {
    expect(layout().map((rail) => rail.featureIds)).toEqual(
      railsOf(PLAN).map((rail) => rail.map((one) => one.id)),
    )
    expect(layout()[1]?.featureIds).toEqual([NOEST, FT2])
  })

  it('leaves bars a subsequence of it, so the first bar and the first feature can be different ones', () => {
    layout().forEach((rail) => {
      const drawn = rail.featureIds.filter((id) => rail.bars.some((bar) => bar.id === id))
      expect(drawn, rail.epicId).toEqual(rail.bars.map((bar) => bar.id))
    })
    expect(layout()[1]?.bars.map((bar) => bar.id)).toEqual([FT2])
  })

  it('omits a feature the pass could not place from the middle of a rail, which is a different hole from the prefix one above and the shape a drop between two bars has to read', () => {
    expect(layout()[2]?.featureIds).toEqual([AROUND_FIRST, SKIPPED, AROUND_LAST])
    expect(layout()[2]?.bars.map((bar) => bar.id)).toEqual([AROUND_FIRST, AROUND_LAST])
    expect(forwardPass(PLAN).unscheduled.map((one) => one.id)).toContain(SKIPPED)
  })

  it('leaves the second bar on that rail at the day the first one ends, an unplaced feature between them cutting no chain', () => {
    expect(barFor(AROUND_FIRST).endDay).toBe(4)
    expect(barFor(AROUND_LAST).startDay).toBe(4)
  })

  it('keeps naming every feature when the wire schedule carries no spans at all', () => {
    expect(railLayout(PLAN, { spans: [] }, SCALE).map((rail) => rail.featureIds)).toEqual(
      layout().map((rail) => rail.featureIds),
    )
  })
})

describe('a rail carries its epic colour as data, because the canvas never chooses a hue', () => {
  it('passes the epic colour through untouched, byte for byte', () => {
    expect(layout().map((rail) => rail.colour)).toEqual(['#ff8833', '#3388ff', '#33ff88', null])
  })

  it('answers null for a rail no epic claims, rather than inventing a default or an empty string', () => {
    expect(layout().at(-1)?.colour).toBeNull()
  })
})

describe('railLayout reads only what it was given', () => {
  it('answers no rails for a plan with no features, not one empty rail per epic', () => {
    const empty: CanvasPlan = { ...PLAN, features: [], items: [] }
    expect(railLayout(empty, wireOf(empty), SCALE)).toEqual([])
  })

  it('omits every bar when the wire schedule carries no spans at all', () => {
    expect(railLayout(PLAN, { spans: [] }, SCALE).map((rail) => rail.bars)).toEqual([[], [], [], []])
  })

  it('mutates neither argument, so two layouts of one plan agree', () => {
    const before = JSON.stringify(PLAN)
    expect(railLayout(PLAN, WIRE, SCALE)).toEqual(railLayout(PLAN, WIRE, SCALE))
    expect(JSON.stringify(PLAN)).toBe(before)
  })
})
