import { railsOf, schedule as forwardPass } from '@repo/schedule'
import type { ScheduleFeature } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { dropTargetFor, railAtY } from './drag.js'
import type { DragPoint, DropQuery, DropTarget, RailMetrics } from './drag.js'
import type { CanvasPlan, CanvasSchedule } from './plan.js'
import { railLayout } from './rails.js'
import type { RailBox } from './rails.js'
import { scaleFor } from './scale.js'

const E1 = 'epic-1'
const E2 = 'epic-2'
const E3 = 'epic-3'
const E4 = 'epic-4'
const E5 = 'epic-5'
const E6 = 'epic-6'
const NO_SUCH_EPIC = 'epic-6-nobody-declared'

const FT1 = 'feature-1'
const MILESTONE = 'feature-2-milestone'
const NOEST = 'feature-3-unestimated'
const FT2 = 'feature-4'
const LONELY = 'feature-5-unestimated'
const KICKOFF = 'feature-6-milestone'
const AFTER_KICKOFF = 'feature-7'
const TRIO_A = 'feature-8'
const TRIO_B = 'feature-9'
const TRIO_C = 'feature-10'
const ORPHAN = 'feature-11-orphan'
const HIDDEN_FIRST = 'feature-12-unestimated'
const ONLY_BAR = 'feature-13'
const HIDDEN_LAST = 'feature-14-unestimated'

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
    { id: E4, railOrder: 3, colour: '#8833ff' },
    { id: E5, railOrder: 4, colour: '#ff3388' },
    { id: E6, railOrder: 5, colour: '#88ff33' },
  ],
  features: [
    feature(FT1, E1, 0, 4),
    feature(MILESTONE, E1, 1, 0),
    feature(NOEST, E2, 0, null),
    feature(FT2, E2, 1, 3),
    feature(LONELY, E3, 0, null),
    feature(KICKOFF, E4, 0, 0),
    feature(AFTER_KICKOFF, E4, 1, 5),
    feature(TRIO_A, E5, 0, 2),
    feature(TRIO_B, E5, 1, 3),
    feature(TRIO_C, E5, 2, 4),
    feature(HIDDEN_FIRST, E6, 0, null),
    feature(ONLY_BAR, E6, 1, 4),
    feature(HIDDEN_LAST, E6, 2, null),
    feature(ORPHAN, NO_SUCH_EPIC, 0, 3),
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

function railFeatures(epicId: string): readonly ScheduleFeature[] {
  const found = railsOf(PLAN).find((rail) => rail[0]?.epicId === epicId)
  if (found === undefined) throw new Error(`no rail was ordered for ${epicId}`)
  return found
}

const storedOrder = (epicId: string): readonly string[] =>
  railFeatures(epicId).map((feature_) => feature_.id)

const storedPosition = (id: string): number | undefined =>
  PLAN.features.find((one) => one.id === id)?.position

const query = (featureId: string, point: DragPoint): DropQuery => ({
  point,
  featureId,
  rails: layout(),
  scale: SCALE,
  metrics: METRICS,
})

const drop = (featureId: string, point: DragPoint): DropTarget | null =>
  dropTargetFor(query(featureId, point))

function placement(featureId: string, point: DragPoint): DropTarget {
  const found = drop(featureId, point)
  if (found === null) throw new Error(`no placement was answered for ${featureId}`)
  return found
}

function orderAfterSending(epicId: string, featureId: string, position: number): readonly string[] {
  const rest = storedOrder(epicId).filter((id) => id !== featureId)
  const landing = Math.max(0, Math.min(Math.trunc(position), rest.length))
  return [...rest.slice(0, landing), featureId, ...rest.slice(landing)]
}

const barsLeftOf = (railIndex: number, x: number): number =>
  railAt(railIndex).bars.filter((bar) => bar.x < x).length

describe('the fixture holds every kind of rail the properties below are stated over', () => {
  it('lays out a whole rail, one the pass could not place whole, an empty one, one opening on a milestone, a trio, one bar between two features with none, and a rail no epic claims', () => {
    expect(layout().map((rail) => rail.epicId)).toEqual([E1, E2, E3, E4, E5, E6, NO_SUCH_EPIC])
    expect(layout().map((rail) => rail.bars.map((bar) => bar.id))).toEqual([
      [FT1, MILESTONE],
      [FT2],
      [],
      [KICKOFF, AFTER_KICKOFF],
      [TRIO_A, TRIO_B, TRIO_C],
      [ONLY_BAR],
      [ORPHAN],
    ])
    expect(forwardPass(PLAN).unscheduled.map((one) => one.id).sort()).toEqual([
      HIDDEN_FIRST,
      HIDDEN_LAST,
      NOEST,
      LONELY,
    ])
  })

  it('holds a rail whose stored order runs past its last bar, which is where a count of features and a place differ', () => {
    expect(storedOrder(E6)).toEqual([HIDDEN_FIRST, ONLY_BAR, HIDDEN_LAST])
    expect(railAt(5).bars.map((bar) => bar.id)).toEqual([ONLY_BAR])
  })

  it('lays every rail out with its bars non-decreasing in x, which is what lets a count of bars name one', () => {
    layout().forEach((rail) => {
      const xs = rail.bars.map((bar) => bar.x)
      expect(xs, rail.epicId).toEqual([...xs].sort((left, right) => left - right))
    })
  })

  it('draws a rail opening on a zero-day milestone with two bars at one x, since that milestone moves no cursor', () => {
    expect(barX(3, KICKOFF)).toBe(barX(3, AFTER_KICKOFF))
  })

  it('draws the trio rail at three x nothing ties on, so a lift-out can be told from a count', () => {
    expect([barX(4, TRIO_A), barX(4, TRIO_B), barX(4, TRIO_C)]).toEqual([120, 136, 160])
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

  it('lands every y in the rails band on the rail the band division names, and every y outside it on none', () => {
    const rails = layout()
    for (let y = top(0) - 2; y <= top(rails.length) + 1; y += 1) {
      const inside = y >= top(0) && y < top(rails.length)
      if (!inside) {
        expect(railAtY(y, rails, METRICS), `y ${String(y)}`).toBeNull()
        continue
      }
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

describe('dropTargetFor names the rail a drag ended over', () => {
  it('names the epic of that rail, which is the key a rail is grouped by', () => {
    layout().forEach((rail, index) => {
      if (rail.epicId === NO_SUCH_EPIC) return
      expect(drop(FT1, at(SCALE.gutter, top(index) + 1))?.epicId).toBe(rail.epicId)
    })
  })
})

describe('dropTargetFor answers the position a rail stores, which a bar index is not', () => {
  it('answers a bar own stored position on a rail the pass placed whole, for a feature dragged in from elsewhere', () => {
    expect(placement(FT2, at(barX(0, FT1), top(0) + 1)).position).toBe(storedPosition(FT1))
    expect(placement(FT2, at(barX(0, MILESTONE), top(0) + 1)).position).toBe(
      storedPosition(MILESTONE),
    )
  })

  it('answers the stored position and not the bar index, where an unplaced feature sits ahead of the target bar', () => {
    const point = at(barX(1, FT2), top(1) + 1)
    expect(barsLeftOf(1, point.x)).toBe(0)
    expect(placement(FT1, point).position).toBe(1)
    expect(orderAfterSending(E2, FT1, placement(FT1, point).position)).toEqual([NOEST, FT1, FT2])
  })

  it('would move the dragged feature past that unplaced feature if the bar index were sent instead', () => {
    expect(orderAfterSending(E2, FT1, barsLeftOf(1, barX(1, FT2)))).toEqual([FT1, NOEST, FT2])
  })

  it('lands a drop right of every bar last on the rail, and not on the place the bar count names', () => {
    const point = at(barX(1, FT2) + 1, top(1) + 1)
    expect(barsLeftOf(1, point.x)).toBe(1)
    expect(placement(FT1, point).position).toBe(2)
    expect(orderAfterSending(E2, FT1, placement(FT1, point).position)).toEqual([NOEST, FT2, FT1])
    expect(orderAfterSending(E2, FT1, 1)).toEqual([NOEST, FT1, FT2])
  })

  it('lands a drop on a rail drawn with no bars behind the unplaced feature already on it', () => {
    expect(railAt(2).bars).toEqual([])
    const target = placement(FT1, at(SCALE.gutter + 400, top(2) + 1))
    expect(target).toEqual({ epicId: E3, position: 1 })
    expect(orderAfterSending(E3, FT1, target.position)).toEqual([LONELY, FT1])
  })

  it('lifts a feature with no bar out of the order too, so an unsized one can be dragged along its own rail', () => {
    const target = placement(NOEST, at(barX(1, FT2) + 1, top(1) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E2, NOEST, target.position)).toEqual([FT2, NOEST])
  })
})

describe('dropTargetFor answers where the drop lands once the dragged feature is lifted out', () => {
  it('lands a bar dragged rightward between the two bars it was dropped between', () => {
    const point = at(barX(4, TRIO_C) - 1, top(4) + 1)
    const target = placement(TRIO_A, point)
    expect(target.position).toBe(1)
    expect(orderAfterSending(E5, TRIO_A, target.position)).toEqual([TRIO_B, TRIO_A, TRIO_C])
  })

  it('would land it one place too far if the bar being dragged were counted, which is the bar count', () => {
    expect(barsLeftOf(4, barX(4, TRIO_C) - 1)).toBe(2)
    expect(orderAfterSending(E5, TRIO_A, 2)).toEqual([TRIO_B, TRIO_C, TRIO_A])
  })

  it('lands a bar dragged leftward between the two bars it was dropped between, where lifting out shifts nothing', () => {
    const target = placement(TRIO_C, at(barX(4, TRIO_B) - 1, top(4) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E5, TRIO_C, target.position)).toEqual([TRIO_A, TRIO_C, TRIO_B])
  })

  it('changes nothing for a drag nudged short of its own bar, its own bar being no bar to land in front of', () => {
    const target = placement(TRIO_B, at(barX(4, TRIO_B) - 1, top(4) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E5, TRIO_B, target.position)).toEqual(storedOrder(E5))
  })

  it('lands a bar dragged past every other bar on its rail last, without the clamp having to save it', () => {
    const target = placement(TRIO_A, at(barX(4, TRIO_C) + 1, top(4) + 1))
    expect(target.position).toBe(2)
    expect(storedOrder(E5).filter((id) => id !== TRIO_A)).toHaveLength(2)
    expect(orderAfterSending(E5, TRIO_A, target.position)).toEqual([TRIO_B, TRIO_C, TRIO_A])
  })

  it('answers the placement that changes nothing, for every bar dropped back on its own x', () => {
    layout().forEach((rail, index) => {
      if (rail.epicId === NO_SUCH_EPIC) return
      rail.bars.forEach((bar) => {
        const target = placement(bar.id, at(bar.x, top(index) + 1))
        expect(orderAfterSending(rail.epicId, bar.id, target.position), bar.id).toEqual(
          storedOrder(rail.epicId),
        )
      })
    })
  })
})

describe('dropTargetFor lands a drop past every bar beside the last bar, and not past a sibling drawn nowhere', () => {
  it('changes nothing for the only bar on a rail, there being no other bar to be anywhere relative to', () => {
    const target = placement(ONLY_BAR, at(barX(5, ONLY_BAR), top(5) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E6, ONLY_BAR, target.position)).toEqual(storedOrder(E6))
  })

  it('would reorder that rail on a drag that moved nothing, if the count of the siblings left were sent', () => {
    expect(storedOrder(E6).filter((id) => id !== ONLY_BAR)).toHaveLength(2)
    expect(orderAfterSending(E6, ONLY_BAR, 2)).toEqual([HIDDEN_FIRST, HIDDEN_LAST, ONLY_BAR])
  })

  it('lands one of that rail own features dropped right of its bar directly after that bar', () => {
    const target = placement(HIDDEN_FIRST, at(barX(5, ONLY_BAR) + 1, top(5) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E6, HIDDEN_FIRST, target.position)).toEqual([
      ONLY_BAR,
      HIDDEN_FIRST,
      HIDDEN_LAST,
    ])
  })

  it('would jump it past the sibling stored beyond that bar, if the count of the siblings left were sent', () => {
    expect(orderAfterSending(E6, HIDDEN_FIRST, 2)).toEqual([ONLY_BAR, HIDDEN_LAST, HIDDEN_FIRST])
  })

  it('lands a feature dragged in from elsewhere right of that bar directly after it, and not last', () => {
    const target = placement(FT1, at(barX(5, ONLY_BAR) + 1, top(5) + 1))
    expect(target.position).toBe(2)
    expect(orderAfterSending(E6, FT1, target.position)).toEqual([
      HIDDEN_FIRST,
      ONLY_BAR,
      FT1,
      HIDDEN_LAST,
    ])
  })

  it('would put it past that sibling too, if the count of the siblings left were sent', () => {
    expect(storedOrder(E6)).toHaveLength(3)
    expect(orderAfterSending(E6, FT1, 3)).toEqual([HIDDEN_FIRST, ONLY_BAR, HIDDEN_LAST, FT1])
  })
})

describe('dropTargetFor keeps the order two bars at one x already have', () => {
  it('changes nothing when the bar behind a leading zero-day milestone is dropped on its own x', () => {
    const point = at(barX(3, AFTER_KICKOFF), top(3) + 1)
    const target = placement(AFTER_KICKOFF, point)
    expect(target.position).toBe(1)
    expect(orderAfterSending(E4, AFTER_KICKOFF, target.position)).toEqual(storedOrder(E4))
  })

  it('would reorder that rail on a drag that ended where it began, if strictly-left had the last word', () => {
    expect(barsLeftOf(3, barX(3, AFTER_KICKOFF))).toBe(0)
    expect(orderAfterSending(E4, AFTER_KICKOFF, 0)).toEqual([AFTER_KICKOFF, KICKOFF])
    expect(storedOrder(E4)).toEqual([KICKOFF, AFTER_KICKOFF])
  })

  it('changes nothing when the leading milestone itself is dropped on its own x', () => {
    const target = placement(KICKOFF, at(barX(3, KICKOFF), top(3) + 1))
    expect(target.position).toBe(0)
    expect(orderAfterSending(E4, KICKOFF, target.position)).toEqual(storedOrder(E4))
  })

  it('still moves the milestone for a drop right of the bar it ties with, so the tie freezes nothing', () => {
    const target = placement(KICKOFF, at(barX(3, AFTER_KICKOFF) + 1, top(3) + 1))
    expect(target.position).toBe(1)
    expect(orderAfterSending(E4, KICKOFF, target.position)).toEqual([AFTER_KICKOFF, KICKOFF])
  })
})

describe('dropTargetFor answers null rather than the nearest rail, so a drag can be cancelled', () => {
  it('answers null for a y in the chrome above the first rail', () => {
    expect(drop(FT1, at(SCALE.gutter + 40, top(0) - 1))).toBeNull()
  })

  it('answers null for a y below the last rail, however far below', () => {
    const rails = layout()
    expect(drop(FT1, at(SCALE.gutter + 40, top(rails.length)))).toBeNull()
    expect(drop(FT1, at(SCALE.gutter + 40, top(rails.length) + 999))).toBeNull()
  })

  it('answers null for an x left of day 0, on a y that a rail does hold', () => {
    expect(railAtY(top(0) + 1, layout(), METRICS)).not.toBeNull()
    expect(drop(FT1, at(SCALE.gutter - 1, top(0) + 1))).toBeNull()
    expect(drop(FT1, at(SCALE.gutter, top(0) + 1))).not.toBeNull()
  })

  it('takes that edge from the scale, so a wider gutter refuses an x the narrower one accepted', () => {
    const wide = scaleFor({ pxPerDay: SCALE.pxPerDay, gutter: SCALE.gutter + 200 })
    const point = at(SCALE.gutter + 40, top(0) + 1)
    expect(drop(FT1, point)).not.toBeNull()
    expect(
      dropTargetFor({ ...query(FT1, point), rails: railLayout(PLAN, WIRE, wide), scale: wide }),
    ).toBeNull()
  })

  it('answers null for a drop on a rail no epic in the plan claims, there being no epicId to send', () => {
    const rails = layout()
    expect(railAtY(top(6) + 1, rails, METRICS)).toBe(rails[6])
    expect(railAt(6).epicId).toBe(NO_SUCH_EPIC)
    expect(PLAN.epics.map((epic) => epic.id)).not.toContain(NO_SUCH_EPIC)
    expect(drop(FT1, at(barX(6, ORPHAN), top(6) + 1))).toBeNull()
    expect(drop(ORPHAN, at(barX(6, ORPHAN), top(6) + 1))).toBeNull()
  })
})

describe('dropTargetFor reads the rail it was handed, there being no second plan to disagree with it', () => {
  it('refuses a rail whose colour is null, which is the only record a box keeps of an unclaimed rail', () => {
    const unclaimed: RailBox = { ...railAt(0), colour: null }
    expect(unclaimed.epicId).toBe(E1)
    expect(PLAN.epics.map((epic) => epic.id)).toContain(E1)
    expect(
      dropTargetFor({ ...query(FT2, at(barX(0, FT1), top(0) + 1)), rails: [unclaimed] }),
    ).toBeNull()
  })

  it('reads the order off the box, so a box holding one rail order cannot be answered in another', () => {
    const reordered: RailBox = { ...railAt(4), featureIds: [TRIO_C, TRIO_B, TRIO_A] }
    const point = at(barX(4, TRIO_C), top(0) + 1)
    expect(dropTargetFor({ ...query(TRIO_A, point), rails: [reordered] })?.position).toBe(0)
    expect(placement(TRIO_A, at(barX(4, TRIO_C), top(4) + 1)).position).toBe(1)
  })

  it('throws rather than answering last, for a box whose bar is not in its own feature order', () => {
    const broken: RailBox = { ...railAt(4), featureIds: [TRIO_A, TRIO_C] }
    expect(broken.bars.map((bar) => bar.id)).toEqual([TRIO_A, TRIO_B, TRIO_C])
    expect(() =>
      dropTargetFor({ ...query(TRIO_A, at(barX(4, TRIO_A), top(0) + 1)), rails: [broken] }),
    ).toThrow(/does not carry it/)
  })
})

describe('dropTargetFor reads only what it was given', () => {
  it('mutates nothing it was handed, so two calls on one query agree', () => {
    const one = query(TRIO_A, at(barX(4, TRIO_C) - 1, top(4) + 1))
    const before = JSON.stringify(one)
    expect(dropTargetFor(one)).toEqual(dropTargetFor(one))
    expect(JSON.stringify(one)).toBe(before)
  })
})
