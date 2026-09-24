import { schedule as forwardPass } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { dropTargetFor, railAtY } from './drag.js'
import type { DragPoint, RailMetrics } from './drag.js'
import type { CanvasPlan, CanvasSchedule } from './plan.js'
import { railLayout } from './rails.js'
import type { RailBox } from './rails.js'
import { scaleFor } from './scale.js'

const E1 = 'epic-1'
const E2 = 'epic-2'
const E3 = 'epic-3'

const FT1 = 'feature-1'
const MILESTONE = 'feature-2-milestone'
const NOEST = 'feature-3-unestimated'
const FT2 = 'feature-4'
const LONELY = 'feature-5-unestimated'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const METRICS: RailMetrics = { chromeHeight: 40, railHeight: 50 }

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
    { id: E1, railOrder: 0, colour: '#ff8833' },
    { id: E2, railOrder: 1, colour: '#3388ff' },
    { id: E3, railOrder: 2, colour: '#33ff88' },
  ],
  features: [
    feature(FT1, E1, 0, 4),
    feature(MILESTONE, E1, 1, 0),
    feature(NOEST, E2, 0, null),
    feature(FT2, E2, 1, 3),
    feature(LONELY, E3, 0, null),
  ],
  items: [],
}

const WIRE: CanvasSchedule = {
  spans: [...forwardPass(PLAN).days].map(([id, span]) => ({
    id,
    startDay: span.startDay,
    endDay: span.endDay,
  })),
}

const layout = (): readonly RailBox[] => railLayout(PLAN, WIRE, SCALE)

const top = (index: number): number => METRICS.chromeHeight + index * METRICS.railHeight

const at = (x: number, y: number): DragPoint => ({ x, y })

function railAt(index: number): RailBox {
  const found = layout()[index]
  if (found === undefined) throw new Error(`no rail was laid out at index ${String(index)}`)
  return found
}

function barX(railIndex: number, id: string): number {
  const found = railAt(railIndex).bars.find((bar) => bar.id === id)
  if (found === undefined) throw new Error(`no bar was laid out for ${id}`)
  return found.x
}

describe('the fixture holds the three kinds of rail every property below is stated over', () => {
  it('lays out a whole rail, a rail with a feature the pass could not place, and an empty one', () => {
    expect(layout().map((rail) => rail.epicId)).toEqual([E1, E2, E3])
    expect(layout().map((rail) => rail.bars.map((bar) => bar.id))).toEqual([
      [FT1, MILESTONE],
      [FT2],
      [],
    ])
    expect(forwardPass(PLAN).unscheduled.map((one) => one.id).sort()).toEqual([NOEST, LONELY])
  })
})

describe('railAtY gives a y to the one rail whose band holds it', () => {
  it('answers the rail at each index for a y inside that rail band', () => {
    const rails = layout()
    rails.forEach((rail, index) => {
      expect(railAtY(top(index) + 1, rails, METRICS)).toBe(rail)
    })
  })

  it('gives every edge to the band below it, so no y falls in two rails', () => {
    const rails = layout()
    expect(railAtY(top(0), rails, METRICS)).toBe(rails[0])
    expect(railAtY(top(0) - 1, rails, METRICS)).toBeNull()
    expect(railAtY(top(1), rails, METRICS)).toBe(rails[1])
    expect(railAtY(top(1) - 1, rails, METRICS)).toBe(rails[0])
    expect(railAtY(top(2), rails, METRICS)).toBe(rails[2])
    expect(railAtY(top(2) - 1, rails, METRICS)).toBe(rails[1])
  })

  it('leaves no y in the rails band unclaimed and none claimed twice, on both sides of every edge', () => {
    const rails = layout()
    const claimers = (y: number): readonly RailBox[] =>
      rails.filter((rail) => railAtY(y, rails, METRICS) === rail)
    for (let y = top(0) - 2; y <= top(rails.length) + 1; y += 1) {
      const inside = y >= top(0) && y < top(rails.length)
      expect(claimers(y).length, `y ${String(y)}`).toBe(inside ? 1 : 0)
      if (!inside) continue
      expect(railAtY(y, rails, METRICS), `y ${String(y)}`).toBe(
        rails[Math.floor((y - METRICS.chromeHeight) / METRICS.railHeight)],
      )
    }
  })

  it('answers null above the first rail, and from the last rail bottom edge downward', () => {
    const rails = layout()
    expect(railAtY(0, rails, METRICS)).toBeNull()
    expect(railAtY(METRICS.chromeHeight - 1, rails, METRICS)).toBeNull()
    expect(railAtY(top(rails.length), rails, METRICS)).toBeNull()
    expect(railAtY(top(rails.length) + 500, rails, METRICS)).toBeNull()
  })

  it('answers null for every y when there is no rail to fall on', () => {
    expect(railAtY(top(0) + 1, [], METRICS)).toBeNull()
  })

  it('reads a band from the metrics it is handed, so nothing here decides how tall a rail is', () => {
    const rails = layout()
    const tighter: RailMetrics = { chromeHeight: 0, railHeight: 10 }
    expect(railAtY(25, rails, tighter)).toBe(rails[2])
    expect(railAtY(25, rails, METRICS)).toBeNull()
    expect(railAtY(top(0) + 1, rails, METRICS)).toBe(rails[0])
  })
})

describe('dropTargetFor answers which rail and which place a drag ended on', () => {
  it('names the epic of the rail the point fell on, which is the key a rail is grouped by', () => {
    const rails = layout()
    rails.forEach((rail, index) => {
      expect(dropTargetFor(at(SCALE.gutter, top(index) + 1), rails, SCALE, METRICS)?.epicId).toBe(
        rail.epicId,
      )
    })
  })

  it('answers position 0 for a drop left of every bar on the rail', () => {
    const rails = layout()
    rails.forEach((rail, index) => {
      expect(dropTargetFor(at(SCALE.gutter, top(index) + 1), rails, SCALE, METRICS)).toEqual({
        epicId: rail.epicId,
        position: 0,
      })
    })
  })

  it('answers the bar count for a drop right of every bar on the rail', () => {
    const rails = layout()
    rails.forEach((rail, index) => {
      const beyond = rail.bars.reduce((x, bar) => Math.max(x, bar.x + 1), SCALE.gutter)
      expect(dropTargetFor(at(beyond, top(index) + 1), rails, SCALE, METRICS)).toEqual({
        epicId: rail.epicId,
        position: rail.bars.length,
      })
    })
  })

  it('answers a bar own place for a drop at that bar own x, so a no-op drag is recognisable', () => {
    const rails = layout()
    rails.forEach((rail, index) => {
      rail.bars.forEach((bar, place) => {
        expect(
          dropTargetFor(at(bar.x, top(index) + 1), rails, SCALE, METRICS),
          `${bar.id} at its own x`,
        ).toEqual({ epicId: rail.epicId, position: place })
      })
    })
  })

  it('answers the position the plan stores, for a drop on a rail the pass placed whole', () => {
    const rails = layout()
    const stored = (id: string): number | undefined =>
      PLAN.features.find((one) => one.id === id)?.position
    expect(dropTargetFor(at(barX(0, FT1), top(0) + 1), rails, SCALE, METRICS)?.position).toBe(
      stored(FT1),
    )
    expect(dropTargetFor(at(barX(0, MILESTONE), top(0) + 1), rails, SCALE, METRICS)?.position).toBe(
      stored(MILESTONE),
    )
  })

  it('counts the bars a rail has and not its features, so an unplaced sibling holds no place', () => {
    const rails = layout()
    expect(railAt(1).bars).toHaveLength(1)
    expect(PLAN.features.filter((one) => one.epicId === E2)).toHaveLength(2)
    expect(dropTargetFor(at(barX(1, FT2) + 1, top(1) + 1), rails, SCALE, METRICS)?.position).toBe(1)
    expect(PLAN.features.find((one) => one.id === FT2)?.position).toBe(1)
  })

  it('answers position 0 for a rail with no bars on it at all', () => {
    const rails = layout()
    expect(railAt(2).bars).toEqual([])
    expect(dropTargetFor(at(SCALE.gutter + 400, top(2) + 1), rails, SCALE, METRICS)).toEqual({
      epicId: E3,
      position: 0,
    })
  })
})

describe('dropTargetFor answers null rather than the nearest rail, so a drag can be cancelled', () => {
  it('answers null for a y in the chrome above the first rail', () => {
    expect(dropTargetFor(at(SCALE.gutter + 40, top(0) - 1), layout(), SCALE, METRICS)).toBeNull()
  })

  it('answers null for a y below the last rail, however far below', () => {
    const rails = layout()
    expect(dropTargetFor(at(SCALE.gutter + 40, top(rails.length)), rails, SCALE, METRICS)).toBeNull()
    expect(
      dropTargetFor(at(SCALE.gutter + 40, top(rails.length) + 999), rails, SCALE, METRICS),
    ).toBeNull()
  })

  it('answers null for an x left of day 0, on a y that a rail does hold', () => {
    const rails = layout()
    expect(railAtY(top(0) + 1, rails, METRICS)).not.toBeNull()
    expect(dropTargetFor(at(SCALE.gutter - 1, top(0) + 1), rails, SCALE, METRICS)).toBeNull()
    expect(dropTargetFor(at(SCALE.gutter, top(0) + 1), rails, SCALE, METRICS)).not.toBeNull()
  })

  it('takes that edge from the scale, so a wider gutter refuses an x the narrower one accepted', () => {
    const wide = scaleFor({ pxPerDay: SCALE.pxPerDay, gutter: SCALE.gutter + 200 })
    const wideRails = railLayout(PLAN, WIRE, wide)
    expect(dropTargetFor(at(SCALE.gutter + 40, top(0) + 1), layout(), SCALE, METRICS)).not.toBeNull()
    expect(dropTargetFor(at(SCALE.gutter + 40, top(0) + 1), wideRails, wide, METRICS)).toBeNull()
  })
})

describe('dropTargetFor reads only what it was given', () => {
  it('mutates neither argument, so two calls on one point agree', () => {
    const rails = layout()
    const point = at(SCALE.gutter + 40, top(1) + 1)
    const before = JSON.stringify([rails, point])
    expect(dropTargetFor(point, rails, SCALE, METRICS)).toEqual(
      dropTargetFor(point, rails, SCALE, METRICS),
    )
    expect(JSON.stringify([rails, point])).toBe(before)
  })
})
