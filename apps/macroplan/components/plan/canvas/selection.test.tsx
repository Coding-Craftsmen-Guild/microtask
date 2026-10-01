import { dayToX, dropTargetFor, railAtY, railLayout, xToDay } from '@repo/canvas'
import type { DayRange, RailBox } from '@repo/canvas'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import {
  EPIC_1,
  EPIC_2,
  EPIC_3,
  EPIC_UNCLAIMED,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_5,
  FEATURE_6,
  railedPlan,
} from '../testing/plan-fixture'
import { PlanCanvas } from './plan-canvas'
import {
  dragPoint,
  ghostAt,
  grabbedAt,
  heldFrom,
  inGutter,
  joinRailIds,
  originAt,
  railsFrom,
  settledAt,
  travelledBy,
  unchanged,
  type Held,
} from './selection'
import { axisX, CANVAS_RANGE, CANVAS_SCALE, LAYOUT, railTop } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

/**
 * A range whose first day is not day 0, which nothing in this app hands the canvas any more.
 *
 * `rangeFor` answers `fromDay: 0` for every plan at every zoom — the extent follows the plan's own
 * span and the origin no longer moves — so this exists to pin what the canvas does with one anyway.
 */
const STARTING_LATE: DayRange = { fromDay: 40, toDay: 100 }

const MODEL: PlanScreenModel = planScreenModel(railedPlan())

const HALF = LAYOUT.railHeight / 2

const only = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const canvasOf = (range: DayRange = CANVAS_RANGE): Element => {
  render(<PlanCanvas at={AT} place={null} plan={MODEL} range={range} />)
  return only('[data-slot="plan-canvas"]')
}

const layoutOf = (): readonly RailBox[] => railLayout(MODEL, MODEL.schedule, CANVAS_SCALE)

const barFor = (id: string): Element =>
  only(`[data-slot="feature-bar"][data-feature-id="${id}"]`)

const railIndexOf = (epicId: string): number =>
  layoutOf().findIndex((rail) => rail.epicId === epicId)

const heldOn = (id: string, epicId: string, canvas: Element): Held => {
  const begun = heldFrom(barFor(id), canvas)
  if (begun === null) throw new Error(`nothing was grabbed for ${id}`)
  expect(begun.grabbed.epicId).toBe(epicId)
  return begun
}

const movedBy = (held: Held, x: number, y: number): Held => ({ ...held, travelled: { x, y } })

afterEach(cleanup)

describe('the fixture these properties are stated over', () => {
  it('draws four rails, one unclaimed, one storing a feature no bar was drawn for, one with two bars', () => {
    const rails = layoutOf()
    expect(rails.map((rail) => rail.epicId)).toEqual([EPIC_1, EPIC_2, EPIC_3, EPIC_UNCLAIMED])
    expect(rails[0]?.featureIds).toEqual([FEATURE_1, FEATURE_2])
    expect(rails[0]?.bars.map((bar) => bar.id)).toEqual([FEATURE_1])
    expect(rails[1]?.bars.map((bar) => bar.id)).toEqual([FEATURE_3, FEATURE_6])
    expect(rails[3]?.colour).toBeNull()
    expect(rails[1]?.colour).not.toBeNull()
  })
})

describe('the layout read back off the canvas that drew it', () => {
  // **The keystone.** `dropTargetFor` is answered against this array, and the array is rebuilt from the
  // markup because the layout may not cross into a client component as a prop. If the two ever differ, a
  // drop is resolved against a canvas nobody is looking at — so they are compared whole, every rail, every
  // bar and every field, against the very call `PlanCanvas` made.
  it('equals the railLayout the canvas was rendered from, field for field', () => {
    const canvas = canvasOf()
    expect(railsFrom(canvas)).toEqual(layoutOf())
  })

  it('reads the rails in the order they were drawn, which is the order railTop was called with', () => {
    const canvas = canvasOf()
    expect(railsFrom(canvas).map((rail) => rail.epicId)).toEqual(
      layoutOf().map((rail) => rail.epicId),
    )
  })

  it('answers a null colour for the rail no epic claims, and a colour for the rails that have one', () => {
    const rails = railsFrom(canvasOf())
    expect(rails.at(-1)?.colour).toBeNull()
    expect(rails[0]?.colour).toBe('#3b82f6')
  })

  it('keeps the whole feature order of a rail whose bars are fewer than its features', () => {
    const rail = railsFrom(canvasOf())[0]
    expect(rail?.featureIds).toEqual([FEATURE_1, FEATURE_2])
    expect(rail?.bars.map((bar) => bar.id)).toEqual([FEATURE_1])
  })

  // The feature the forward pass could not place has **no mark on the canvas at all** now. It was a
  // gutter stub carrying `data-placed="false"`, which `railsFrom` excluded from `bars` while one grab
  // resolved either; `UnscheduledTray` gives it a row under the board instead, where there is room to
  // say why it has no bar and to link to the drawer that would give it one. So the filter that used to
  // separate stubs from bars now excludes nothing, and that is the thing worth pinning: every mark the
  // canvas draws is a placed bar.
  it('draws no mark whatever for the feature no bar was placed for, the tray listing it instead', () => {
    const canvas = canvasOf()
    expect(canvas.querySelector(`[data-feature-id="${FEATURE_2}"]`)).toBeNull()
    expect(canvas.querySelectorAll('[data-slot="feature-bar"]')).toHaveLength(
      layoutOf().reduce((count, rail) => count + rail.bars.length, 0),
    )
  })

  it('joins a rail’s ids with a separator no ULID can contain, so the split is the inverse', () => {
    const ids = [FEATURE_1, FEATURE_2]
    expect(joinRailIds(ids)).toBe(`${FEATURE_1} ${FEATURE_2}`)
    expect(railsFrom(canvasOf())[0]?.featureIds).toEqual(ids)
  })
})

describe('what a pointer went down on', () => {
  it('reads the bar’s own feature, its rail’s epic and the rect’s own geometry off the attributes', () => {
    canvasOf()
    const bar = layoutOf()[1]?.bars[0]
    expect(grabbedAt(barFor(FEATURE_3))).toEqual({
      featureId: FEATURE_3,
      epicId: EPIC_2,
      x: bar?.x,
      y: railTop(railIndexOf(EPIC_2)) + LAYOUT.barTop,
      width: bar?.width,
    })
  })

  // `[data-slot="time-grid"]` in place of the chrome band that used to be asked about: the quarter
  // labels and the sprint ticks are an HTML row above the canvas now, and what is left inside the SVG
  // behind the bars is the grid's bands and rules. It is the layer a pointer most often lands on, so it
  // is the one that must resolve to no grab rather than to the bar nearest it.
  it('answers null for the canvas itself, for the grid behind the bars, for a band and for nothing', () => {
    const canvas = canvasOf()
    expect(grabbedAt(canvas)).toBeNull()
    expect(grabbedAt(only('[data-slot="time-grid"]'))).toBeNull()
    expect(grabbedAt(only('[data-slot="rail"]'))).toBeNull()
    expect(grabbedAt(null)).toBeNull()
  })

  // A bar used to carry its own name, a `<text>` sibling that `closest()` could not reach a bar from.
  // That needed `pointer-events-none` on every label to keep a hole out of the drag target exactly
  // where the bar is easiest to hit. The canvas draws no text at all now, so the hole cannot exist and
  // there is nothing left to assert about it.
  it('resolves the bar from a descendant of it too, which is what closest() buys', () => {
    canvasOf()
    expect(grabbedAt(barFor(FEATURE_1))?.featureId).toBe(FEATURE_1)
  })
})

describe('the drag a pointerdown begins', () => {
  it('holds the band top of the rail’s own index, and never a number read off the rect', () => {
    const canvas = canvasOf()
    expect(heldOn(FEATURE_3, EPIC_2, canvas).railTop).toBe(railTop(railIndexOf(EPIC_2)))
    expect(heldOn(FEATURE_5, EPIC_UNCLAIMED, canvas).railTop).toBe(railTop(railIndexOf(EPIC_UNCLAIMED)))
  })

  it('holds the whole layout and the canvas’s own box, so a ghost cannot use a different one', () => {
    const canvas = canvasOf()
    const held = heldOn(FEATURE_1, EPIC_1, canvas)
    expect(held.rails).toEqual(layoutOf())
    expect(held.box.width).toBe(Number(canvas.getAttribute('width')))
    expect(held.box.height).toBe(Number(canvas.getAttribute('height')))
  })

  it('begins at nowhere, so the first thing a zero-pixel drag answers is where it already is', () => {
    expect(heldOn(FEATURE_1, EPIC_1, canvasOf()).travelled).toEqual({ x: 0, y: 0 })
  })

  it('answers null when the pointer hit no bar', () => {
    const canvas = canvasOf()
    expect(heldFrom(canvas, canvas)).toBeNull()
  })
})

describe('the x a drag hands over is the bar’s left edge and never the pointer’s', () => {
  it('equals the bar’s own x attribute plus the pointer’s travel, for every bar on the canvas', () => {
    canvasOf()
    for (const rail of layoutOf()) {
      for (const bar of rail.bars) {
        const own = Number(barFor(bar.id).getAttribute('x'))
        for (const travel of [-40, -1, 0, 1, 40]) {
          const point = dragPoint({ barX: own, railTop: 0 }, { x: travel, y: 0 })
          expect(point.x, `${bar.id} by ${String(travel)}`).toBe(own + travel)
        }
      }
    }
  })

  it('answers the bar’s own day for a drag of nothing, where the raw pointer x would be days out', () => {
    canvasOf()
    const bar = layoutOf()[0]?.bars[0]
    const own = Number(barFor(FEATURE_1).getAttribute('x'))
    const grabbedAtRightEnd = own + 4 * CANVAS_SCALE.pxPerDay
    expect(xToDay(dragPoint({ barX: own, railTop: 0 }, { x: 0, y: 0 }).x, CANVAS_SCALE)).toBe(
      bar?.startDay,
    )
    expect(xToDay(grabbedAtRightEnd, CANVAS_SCALE)).toBe((bar?.startDay ?? 0) + 4)
  })
})

describe('the y a drag hands over is the bar’s band-relative centre', () => {
  it('is the middle of its own band for a drag of nothing, so a zero drag names its own rail', () => {
    const rails = layoutOf()
    for (const [index, rail] of rails.entries()) {
      const y = dragPoint({ barX: 0, railTop: railTop(index) }, { x: 0, y: 0 }).y
      expect(y).toBe(railTop(index) + HALF)
      expect(railAtY(y, rails, LAYOUT), rail.epicId).toBe(rail)
    }
  })

  it('keeps its own rail for anything less than half a band up, and hands over past that', () => {
    const rails = layoutOf()
    const at = (index: number, dy: number) =>
      railAtY(dragPoint({ barX: 0, railTop: railTop(index) }, { x: 0, y: dy }).y, rails, LAYOUT)
    expect(at(1, -(HALF - 1))).toBe(rails[1])
    expect(at(1, -HALF)).toBe(rails[1])
    expect(at(1, -(HALF + 1))).toBe(rails[0])
  })

  it('hands over to the rail below at exactly half a band down, and not before', () => {
    const rails = layoutOf()
    const at = (index: number, dy: number) =>
      railAtY(dragPoint({ barX: 0, railTop: railTop(index) }, { x: 0, y: dy }).y, rails, LAYOUT)
    expect(at(1, HALF - 1)).toBe(rails[1])
    expect(at(1, HALF)).toBe(rails[2])
  })

  // Why the half band is the reason for the offset rather than a fudge: without it, the y handed over is
  // the band's own **top**, and `railAtY` gives every edge to the band below it — so one pixel upward
  // changes rails while a whole band of downward travel does not.
  it('would hand over one pixel up and a full band down without the half band', () => {
    const rails = layoutOf()
    const top = railTop(1)
    expect(railAtY(top - 1, rails, LAYOUT)).toBe(rails[0])
    expect(railAtY(top + LAYOUT.railHeight - 1, rails, LAYOUT)).toBe(rails[1])
  })
})

describe('railTop and railAtY are the two directions of one number', () => {
  // They live in different packages — `railTop` here, `railAtY` in `@repo/canvas`, which takes `LAYOUT`
  // as its `RailMetrics` — so only a test that calls both can catch them disagreeing. The **first pixel**
  // of each band, because an off-by-one in either direction shows up at an edge and nowhere else.
  it('lands the first pixel of every band on the rail that band was drawn for', () => {
    const rails = layoutOf()
    expect(rails.length).toBeGreaterThan(3)
    for (const [index, rail] of rails.entries()) {
      expect(railAtY(railTop(index), rails, LAYOUT), `top of ${String(index)}`).toBe(rail)
      expect(railAtY(railTop(index) + 1, rails, LAYOUT), `just into ${String(index)}`).toBe(rail)
    }
  })

  it('lands the last pixel of every band on the same rail, and the next pixel on the next', () => {
    const rails = layoutOf()
    for (const [index, rail] of rails.entries()) {
      const last = railTop(index) + LAYOUT.railHeight - 1
      expect(railAtY(last, rails, LAYOUT), `bottom of ${String(index)}`).toBe(rail)
      expect(railAtY(last + 1, rails, LAYOUT)).toBe(rails[index + 1] ?? null)
    }
  })

  // The first band used to start `chromeHeight` down, under the quarter labels and the sprint ticks.
  // Those are an HTML row above the canvas now, so `chromeHeight` is 0 and the first rail begins at the
  // very top of the SVG — which makes "above the first rail" a negative y and nothing else. It stays in
  // `LAYOUT` because `RailMetrics` declares it and `railAtY` measures every band from it, so a value
  // that drifted from `railTop`'s would be a drop resolved against a band nobody drew.
  it('starts the first band at the very top of the canvas, and puts no rail above it', () => {
    const rails = layoutOf()
    expect(LAYOUT.chromeHeight).toBe(0)
    expect(railTop(0)).toBe(0)
    expect(railAtY(railTop(0) - 1, rails, LAYOUT)).toBeNull()
  })
})

describe('the travel a client-pixel delta becomes, now that there is no factor at all', () => {
  it('travels the distance the pointer did, a client pixel being a user unit on a canvas with no viewBox', () => {
    const origin = originAt({ x: 100, y: 50 })
    expect(travelledBy(origin, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 })
    expect(travelledBy(origin, { x: 110, y: 45 })).toEqual({ x: 10, y: -5 })
  })

  it('needs no measurement at all, which is what dropping the viewBox bought', () => {
    expect(Object.keys(originAt({ x: 7, y: 9 })).sort()).toEqual(['x', 'y'])
  })
})

// The function keeps the gutter's name and the gutter is gone. It was the 160px strip of SVG left of day
// zero that a rail's name was drawn into; the names are an HTML column beside the canvas now, so
// `CANVAS_SCALE.gutter` is 0, `dayToX(0)` is the canvas's own left edge, and there is no strip left for a
// drop to land in. What survives is the refusal itself, asked against **the axis the canvas was drawn
// from** rather than against day 0 — the same pixel on every canvas this app draws, and still the check
// that stops a placement being sent from a pointer that is off the axis.
describe('inGutter, the refusal of everything left of the axis it is handed', () => {
  it('refuses everything left of the axis and accepts the axis’s own first pixel', () => {
    const at = axisX(CANVAS_SCALE, CANVAS_RANGE)
    expect(inGutter(at - 1, at)).toBe(true)
    expect(inGutter(at, at)).toBe(false)
    expect(inGutter(at + 1, at)).toBe(false)
  })

  it('is asked about an axis that is the canvas’s own left edge, no gutter being drawn before it', () => {
    expect(CANVAS_SCALE.gutter).toBe(0)
    expect(axisX(CANVAS_SCALE, CANVAS_RANGE)).toBe(0)
    expect(canvasOf().getAttribute('viewBox')).toBeNull()
  })

  // The two refusals coincide on every canvas this app draws, `rangeFor` answering `fromDay: 0` for every
  // plan at every zoom. That is why nothing had to ask this before, and it is still worth asserting: the
  // coincidence is a property of the range, not of either function.
  it('agrees with dropTargetFor’s own day-0 refusal, which on this axis is the same pixel', () => {
    const rails = layoutOf()
    const at = axisX(CANVAS_SCALE, CANVAS_RANGE)
    const query = (x: number) => ({
      point: { x, y: railTop(0) + HALF },
      featureId: FEATURE_1,
      rails,
      scale: CANVAS_SCALE,
      metrics: LAYOUT,
    })
    expect(dropTargetFor(query(at - 1))).toBeNull()
    expect(inGutter(at - 1, at)).toBe(true)
    expect(dropTargetFor(query(at))).not.toBeNull()
  })

  // And here is what asking it against the axis still buys, now that no rail label is in the way: hand it
  // the axis of a range that starts later — which is exactly what `axisX` answers for one — and it refuses
  // an x naming a positive day, which `dropTargetFor` alone accepts.
  it('refuses an x naming a positive day when the axis it is handed starts later than day 0', () => {
    const at = axisX(CANVAS_SCALE, STARTING_LATE)
    const before = at - 20
    expect(xToDay(before, CANVAS_SCALE)).toBeGreaterThan(0)
    expect(
      dropTargetFor({
        point: { x: before, y: railTop(0) + HALF },
        featureId: FEATURE_1,
        rails: layoutOf(),
        scale: CANVAS_SCALE,
        metrics: LAYOUT,
      }),
    ).not.toBeNull()
    expect(inGutter(before, at)).toBe(true)
  })

  // The canvas itself no longer has a second axis to be drawn from. `gutterX` offset the old `viewBox`'s
  // own x so that a viewport scrolled to day 40 kept its gutter on screen; it is deleted, there is no
  // `viewBox` left at all, and a range's `fromDay` now changes only how many days are drawn. So the axis
  // `inGutter` is asked about is x 0 whatever range the canvas was handed.
  it('has one axis to refuse against, a later range changing the canvas’s width and not its origin', () => {
    const late = canvasOf(STARTING_LATE)
    const days = STARTING_LATE.toDay - STARTING_LATE.fromDay
    expect(late.getAttribute('viewBox')).toBeNull()
    expect(Number(late.getAttribute('width'))).toBe(days * CANVAS_SCALE.pxPerDay)
    expect(Number(late.getAttribute('height'))).toBe(layoutOf().length * LAYOUT.railHeight)
  })
})

describe('what a drop settles on', () => {
  it('answers where it came from as the same question asked of a drag that travelled nothing', () => {
    const canvas = canvasOf()
    for (const rail of layoutOf()) {
      for (const bar of rail.bars) {
        const held = heldOn(bar.id, rail.epicId, canvas)
        const settled = settledAt(held, CANVAS_SCALE, dayToX(0, CANVAS_SCALE))
        expect(settled.to, bar.id).toEqual(settled.back)
        expect(unchanged(settled), bar.id).toBe(rail.colour !== null)
      }
    }
  })

  it('refuses a rail no epic claims, so a bar dropped back on it sends nothing and is cancelled', () => {
    const canvas = canvasOf()
    const settled = settledAt(
      heldOn(FEATURE_5, EPIC_UNCLAIMED, canvas),
      CANVAS_SCALE,
      dayToX(0, CANVAS_SCALE),
    )
    expect(settled.to).toBeNull()
    expect(unchanged(settled)).toBe(false)
  })

  it('answers a different placement once the drag has crossed into the gap beside it', () => {
    const canvas = canvasOf()
    const held = heldOn(FEATURE_3, EPIC_2, canvas)
    const moved = movedBy(held, 5 * CANVAS_SCALE.pxPerDay, 0)
    const settled = settledAt(moved, CANVAS_SCALE, dayToX(0, CANVAS_SCALE))
    expect(settled.back).toEqual({ epicId: EPIC_2, position: 0 })
    expect(settled.to).toEqual({ epicId: EPIC_2, position: 1 })
    expect(unchanged(settled)).toBe(false)
  })

  it('answers the rail under the pointer for a drag half a band down, keeping the place it lands in', () => {
    const canvas = canvasOf()
    const held = heldOn(FEATURE_1, EPIC_1, canvas)
    const settled = settledAt(movedBy(held, 0, HALF), CANVAS_SCALE, dayToX(0, CANVAS_SCALE))
    expect(settled.to?.epicId).toBe(EPIC_2)
    expect(settled.back?.epicId).toBe(EPIC_1)
  })

  // Both refusals moved with the chrome. A drag "into the gutter" was one of `CANVAS_SCALE.gutter` px
  // leftward, which is now no drag at all — so what is refused is a drag off the axis's own left edge, and
  // one pixel does it for a bar that starts on day 0. A drag "above the first rail" was one into the
  // chrome band; with `chromeHeight` at 0 that band is an HTML row outside the SVG, so above the first
  // rail is a negative y. Neither clamps to the nearest rail or to day 0: §6 has no packing algorithm.
  it('refuses a drag off the left edge of the axis and one above the first rail, clamping neither', () => {
    const canvas = canvasOf()
    const held = heldOn(FEATURE_3, EPIC_2, canvas)
    const at = axisX(CANVAS_SCALE, CANVAS_RANGE)
    expect(held.grabbed.x).toBe(at)
    expect(settledAt(movedBy(held, -1, 0), CANVAS_SCALE, at).to).toBeNull()
    expect(settledAt(movedBy(held, 0, -LAYOUT.railHeight * 4), CANVAS_SCALE, at).to).toBeNull()
  })
})

describe('where the ghost of a dragged bar is drawn', () => {
  it('is the rect’s own top left plus the travel, sharing its x with the point the drop used', () => {
    const canvas = canvasOf()
    const held = movedBy(heldOn(FEATURE_1, EPIC_1, canvas), 30, -7)
    expect(ghostAt(held)).toEqual({ x: held.grabbed.x + 30, y: held.grabbed.y - 7 })
    expect(ghostAt(held).x).toBe(dragPoint({ barX: held.grabbed.x, railTop: held.railTop }, held.travelled).x)
  })

  it('is the rect’s y and not the band-relative centre the drop is answered about', () => {
    const held = heldOn(FEATURE_1, EPIC_1, canvasOf())
    expect(ghostAt(held).y).toBe(held.grabbed.y)
    expect(ghostAt(held).y).not.toBe(dragPoint({ barX: 0, railTop: held.railTop }, held.travelled).y)
  })
})
