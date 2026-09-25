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
  userScale,
  type Held,
} from './selection'
import { CANVAS_RANGE, CANVAS_SCALE, LAYOUT, railTop } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

const PANNED: DayRange = { fromDay: 40, toDay: 100 }

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

  it('counts a gutter stub as no bar, though one grab resolves either', () => {
    const canvas = canvasOf()
    expect(barFor(FEATURE_2).getAttribute('data-placed')).toBe('false')
    expect(railsFrom(canvas)[0]?.bars).toHaveLength(1)
    expect(grabbedAt(barFor(FEATURE_2))?.featureId).toBe(FEATURE_2)
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
      y: LAYOUT.chromeHeight + LAYOUT.railHeight + LAYOUT.barTop,
      width: bar?.width,
    })
  })

  it('answers null for the canvas itself, for a chrome layer and for nothing at all', () => {
    const canvas = canvasOf()
    expect(grabbedAt(canvas)).toBeNull()
    expect(grabbedAt(only('[data-slot="rail"]'))).toBeNull()
    expect(grabbedAt(null)).toBeNull()
  })

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
    expect(held.box.viewBox).toBe(canvas.getAttribute('viewBox'))
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

  it('puts the first band directly under the chrome, and nothing above it on any rail', () => {
    const rails = layoutOf()
    expect(railTop(0)).toBe(LAYOUT.chromeHeight)
    expect(railAtY(railTop(0) - 1, rails, LAYOUT)).toBeNull()
  })
})

describe('the factor a client-pixel delta is converted by', () => {
  it('is one for a canvas drawn at its own user units, which is what this canvas is', () => {
    expect(userScale(1000, 1000)).toBe(1)
  })

  it('is the ratio for a canvas the layout squeezed, so a bar moves the distance the pointer did', () => {
    expect(userScale(1000, 500)).toBe(2)
    expect(userScale(1000, 2000)).toBe(0.5)
  })

  // happy-dom measures every element as a zero `DOMRect`, and a browser measures this canvas as zero
  // while the table view is chosen — `PlanScreen` hides it with `display:none`. Both want the same answer.
  it('is one rather than infinite for a canvas nothing can measure', () => {
    expect(userScale(1000, 0)).toBe(1)
    expect(userScale(1000, Number.NaN)).toBe(1)
  })

  it('converts a travel by that factor, and answers nothing for a pointer that has not moved', () => {
    const origin = originAt({ x: 100, y: 50 }, { viewBox: '', width: 1000, height: 10 }, 500)
    expect(origin.factor).toBe(2)
    expect(travelledBy(origin, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 })
    expect(travelledBy(origin, { x: 110, y: 45 })).toEqual({ x: 20, y: -10 })
  })

  it('takes the measurement the test world gives it and is therefore one here', () => {
    const canvas = canvasOf()
    const box = { viewBox: '', width: Number(canvas.getAttribute('width')), height: 0 }
    expect(canvas.getBoundingClientRect().width).toBe(0)
    expect(originAt({ x: 0, y: 0 }, box, canvas.getBoundingClientRect().width).factor).toBe(1)
  })
})

describe('the gutter refusal, which is a precondition made into a check', () => {
  it('refuses everything left of the axis and accepts the axis’s own first pixel', () => {
    const axisX = dayToX(CANVAS_RANGE.fromDay, CANVAS_SCALE)
    expect(inGutter(axisX - 1, axisX)).toBe(true)
    expect(inGutter(axisX, axisX)).toBe(false)
    expect(inGutter(axisX + 1, axisX)).toBe(false)
  })

  // On an unpanned canvas the two refusals coincide, which is why nothing had to ask this before.
  it('agrees with dropTargetFor’s own day-0 refusal while the canvas starts at day 0', () => {
    const rails = layoutOf()
    const axisX = dayToX(0, CANVAS_SCALE)
    const query = (x: number) => ({
      point: { x, y: railTop(0) + HALF },
      featureId: FEATURE_1,
      rails,
      scale: CANVAS_SCALE,
      metrics: LAYOUT,
    })
    expect(dropTargetFor(query(axisX - 1))).toBeNull()
    expect(inGutter(axisX - 1, axisX)).toBe(true)
    expect(dropTargetFor(query(axisX))).not.toBeNull()
  })

  // And here is the case that made it worth asking: pan the canvas and the label gutter sits over
  // positive days, so a drop on a rail's **name** is a day `dropTargetFor` accepts.
  it('refuses a drop on a panned canvas’s rail label, which dropTargetFor alone would accept', () => {
    const axisX = dayToX(PANNED.fromDay, CANVAS_SCALE)
    const inTheLabel = axisX - 20
    expect(xToDay(inTheLabel, CANVAS_SCALE)).toBeGreaterThan(0)
    expect(
      dropTargetFor({
        point: { x: inTheLabel, y: railTop(0) + HALF },
        featureId: FEATURE_1,
        rails: layoutOf(),
        scale: CANVAS_SCALE,
        metrics: LAYOUT,
      }),
    ).not.toBeNull()
    expect(inGutter(inTheLabel, axisX)).toBe(true)
  })

  it('is the axis the canvas was really drawn from, so a panned canvas moves the refusal with it', () => {
    const panned = canvasOf(PANNED)
    expect(panned.getAttribute('viewBox')?.startsWith(String(dayToX(40, CANVAS_SCALE) - 160))).toBe(true)
    expect(inGutter(dayToX(40, CANVAS_SCALE) - 20, dayToX(40, CANVAS_SCALE))).toBe(true)
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

  it('refuses a drag into the gutter and one above the first rail, rather than clamping either', () => {
    const canvas = canvasOf()
    const held = heldOn(FEATURE_3, EPIC_2, canvas)
    const axisX = dayToX(0, CANVAS_SCALE)
    expect(settledAt(movedBy(held, -CANVAS_SCALE.gutter, 0), CANVAS_SCALE, axisX).to).toBeNull()
    expect(settledAt(movedBy(held, 0, -LAYOUT.railHeight * 4), CANVAS_SCALE, axisX).to).toBeNull()
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
