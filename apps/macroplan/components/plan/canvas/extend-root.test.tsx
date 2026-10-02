import { scaleFor, type DayRange } from '@repo/canvas'
import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { DRAWN_NAMES } from './extend-view'
import type { ExtendWrites } from './extend-write'
import { PlanCanvas } from './plan-canvas'

const AT = new Date('2026-09-28T09:00:00.000Z')

const RANGE: DayRange = { fromDay: 0, toDay: 40 }

const SCALE = scaleFor({ pxPerDay: 14, gutter: 0 })

// happy-dom measures nothing — every `DOMRect` it answers is zeros (ADR 0055) — which is what makes this
// gesture testable at all: the canvas's own box is the origin, so a client x of 140 is day 10 at this
// scale and a client y of 26 is the middle of the first lane. The numbers below are chosen that way.
const DAY = SCALE.pxPerDay

const LANE_ONE = 26

const LANE_TWO = 78

const writes = () => ({
  createFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  createItem: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  labelFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  placeFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  placeItem: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  setDependencies: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
})

const railed = () => {
  const plan = atlasPlan()
  const first = plan.epics[0]
  if (first === undefined) throw new Error('the fixture holds no rail')
  return planScreenModel({
    ...plan,
    epics: [first, { ...first, id: 'rail-two', name: 'Payments', railOrder: 1 }],
  })
}

const show = (draw: ExtendWrites, plan = planScreenModel(atlasPlan())) =>
  render(
    <PlanCanvas at={AT} draw={draw} place={null} plan={plan} range={RANGE} rung="item" scale={SCALE} />,
  )

const handles = (): readonly Element[] => [...document.querySelectorAll('[data-slot="extend-handle"]')]

const sideOf = (side: 'start' | 'end'): Element => {
  const found = handles().find((one) => one.getAttribute('data-side') === side)
  if (found === undefined) throw new Error(`no ${side} handle is drawn`)
  return found
}

const mark = (id: string): Element => {
  const found = document.querySelector(`[data-item-id="${id}"]`)
  if (found === null) throw new Error(`no mark for ${id}`)
  return found
}

const feature = (id: string): Element => {
  const found = document.querySelector(`[data-feature-id="${id}"]`)
  if (found === null) throw new Error(`no mark for ${id}`)
  return found
}

const chip = (): string => document.querySelector('[data-slot="draw-chip"]')?.textContent ?? ''

// The pointer is captured on the root for the length of a drag, so every move and the release are
// delivered there whatever they pass over — and the handle the drag started from is gone by then, a
// detached node being one no event bubbles from.
const root = (): Element => document.querySelector('[data-slot="extend-root"]') ?? document.body

const drag = (from: Element, to: { x: number; y: number }) => {
  fireEvent.pointerDown(from, { pointerId: 1 })
  fireEvent.pointerMove(root(), { clientX: to.x, clientY: to.y, pointerId: 1 })
  return () => fireEvent.pointerUp(root(), { clientX: to.x, clientY: to.y, pointerId: 1 })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('the handles, which are drawn over the mark under the pointer', () => {
  it('draws none until a mark is hovered, the board being two thousand marks at the cap', () => {
    show(writes())

    expect(handles()).toEqual([])
  })

  it('draws both ends of the item the pointer is on', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))

    expect(handles()).toHaveLength(2)
    expect(handles().map((one) => one.getAttribute('data-side'))).toEqual(['start', 'end'])
  })

  it('draws them over a feature too, which at this rung is a line with diamonds', () => {
    show(writes())
    fireEvent.pointerOver(feature(FEATURE_1))

    expect(handles()).toHaveLength(2)
    expect(handles()[0]?.querySelector('polygon')).toBeTruthy()
  })

  it('draws a circle on an item’s bar and a diamond on a feature’s line, as each rung draws it', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))

    expect(handles()[0]?.querySelector('circle')).toBeTruthy()
  })

  it('moves them to the next mark the pointer enters, there only ever being one pair', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    fireEvent.pointerOver(feature(FEATURE_2))

    expect(handles()).toHaveLength(2)
  })

  it('takes them away once the pointer is over nothing at all', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    fireEvent.pointerOver(document.querySelector('svg') ?? document.body)

    expect(handles()).toEqual([])
  })

  // The handles sit on the mark's edge rather than inside it, so entering one is leaving the mark: the
  // hovered mark has to survive that or the handle goes out from under the pointer.
  it('keeps them while the pointer is on one of them', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    fireEvent.pointerOver(sideOf('end'))

    expect(handles()).toHaveLength(2)
  })

  it('draws none at all where the surface may create nothing', () => {
    show({
      createFeature: null,
      createItem: null,
      labelFeature: null,
      placeFeature: null,
      placeItem: null,
      setDependencies: null,
    })
    fireEvent.pointerOver(mark(ITEM_1))

    expect(handles()).toEqual([])
    expect(document.querySelector('[data-slot="extend-root"]')).toBeNull()
  })
})

describe('the bar a drag draws', () => {
  it('says what will be made and how long it is, while the pointer is down', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 12 * DAY, y: LANE_ONE })

    expect(chip()).toContain(DRAWN_NAMES.item)
    expect(chip()).toContain('after')
    expect(document.querySelector('[data-slot="draw-ghost"]')).toBeTruthy()
  })

  it('takes the bar away again on release', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 12 * DAY, y: LANE_ONE })()

    expect(document.querySelector('[data-slot="draw-ghost"]')).toBeNull()
  })

  it('puts the handles away while a draw is in progress', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 12 * DAY, y: LANE_ONE })

    expect(handles()).toEqual([])
  })
})

describe('what a release writes', () => {
  it('adds an item to the feature the source item belongs to, sized to the drawn length', () => {
    const draw = writes()
    show(draw)
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 9 * DAY, y: LANE_ONE })()

    expect(draw.createItem).toHaveBeenCalledOnce()
    expect(draw.createItem).toHaveBeenCalledWith(
      PLAN_A,
      expect.objectContaining({ featureId: FEATURE_1, name: DRAWN_NAMES.item }),
    )
    expect(draw.createFeature).not.toHaveBeenCalled()
  })

  it('adds a feature to the rail a feature was drawn from, with an edge between the two', () => {
    const draw = writes()
    show(draw)
    fireEvent.pointerOver(feature(FEATURE_1))
    drag(sideOf('end'), { x: 20 * DAY, y: LANE_ONE })()

    expect(draw.createFeature).toHaveBeenCalledOnce()
    expect(draw.createFeature).toHaveBeenCalledWith(
      PLAN_A,
      expect.objectContaining({ epicId: EPIC_1, name: DRAWN_NAMES.feature }),
    )
  })

  // Crossing lanes makes a feature on the lane it was dropped on, whatever it was drawn from: an item
  // belongs to one feature and a feature to one rail.
  it('adds a feature on another rail when the draw crosses lanes, even from an item', () => {
    const draw = writes()
    show(draw, railed())
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 20 * DAY, y: LANE_TWO })()

    expect(draw.createFeature).toHaveBeenCalledOnce()
    expect(draw.createFeature).toHaveBeenCalledWith(
      PLAN_A,
      expect.objectContaining({ epicId: 'rail-two' }),
    )
    expect(draw.createItem).not.toHaveBeenCalled()
  })

  it('writes nothing for a release off the rails altogether', () => {
    const draw = writes()
    show(draw)
    fireEvent.pointerOver(mark(ITEM_1))
    drag(sideOf('end'), { x: 9 * DAY, y: 4000 })()

    expect(draw.createItem).not.toHaveBeenCalled()
    expect(draw.createFeature).not.toHaveBeenCalled()
  })

  it('writes nothing when the draw is abandoned rather than released', () => {
    const draw = writes()
    show(draw)
    fireEvent.pointerOver(mark(ITEM_1))
    const release = drag(sideOf('end'), { x: 9 * DAY, y: LANE_ONE })
    fireEvent.pointerCancel(root(), { pointerId: 1 })
    release()

    expect(draw.createItem).not.toHaveBeenCalled()
  })
})

// A drag of something else is not a hover: a bar being moved to another rail would otherwise collect
// handles under the pointer, whose own targets land over the drag's.
describe('what the handles do while something else is being dragged', () => {
  it('draws none for a pointer that moves with a button held down', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1), { buttons: 1 })

    expect(handles()).toEqual([])
  })

  it('draws them again once the button is released', () => {
    show(writes())
    fireEvent.pointerOver(mark(ITEM_1), { buttons: 1 })
    fireEvent.pointerOver(mark(ITEM_1), { buttons: 0 })

    expect(handles()).toHaveLength(2)
  })
})
