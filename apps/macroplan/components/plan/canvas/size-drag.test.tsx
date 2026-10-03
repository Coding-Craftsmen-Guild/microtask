import { scaleFor, type DayRange } from '@repo/canvas'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { atlasPlan, FEATURE_1, ITEM_1, ITEM_2 } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanCanvas } from './plan-canvas'
import { BROKEN_DOWN } from './size-view'
import type { SizeWrites } from './size-write'

const AT = new Date('2026-09-28T09:00:00.000Z')

const RANGE: DayRange = { fromDay: 0, toDay: 40 }

const SCALE = scaleFor({ pxPerDay: 14, gutter: 0 })

const DAY = SCALE.pxPerDay

const NO_SIZES: SizeWrites = { estimateFeature: null, estimateItem: null }

const DRAWS = {
  createFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  createItem: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  labelFeature: null,
  placeFeature: null,
  placeItem: null,
  setDependencies: null,
}

type Estimating = NonNullable<SizeWrites['estimateItem']>

const sizes = () => ({
  estimateFeature: vi.fn<Estimating>(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  estimateItem: vi.fn<Estimating>(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
})

const shown = (size: SizeWrites) =>
  render(
    <PlanCanvas
      at={AT}
      place={null}
      plan={planScreenModel(atlasPlan())}
      range={RANGE}
      rung="item"
      scale={SCALE}
      size={size}
    />,
  )

const at = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const handles = (): readonly Element[] => [...document.querySelectorAll('[data-slot="extend-handle"]')]

const sideOf = (side: 'start' | 'end'): Element => {
  const found = handles().find((one) => one.getAttribute('data-side') === side)
  if (found === undefined) throw new Error(`no ${side} handle is drawn`)
  return found
}

const ctrl = (down: boolean): void => {
  if (down) fireEvent.keyDown(window, { key: 'Control' })
  else fireEvent.keyUp(window, { key: 'Control' })
}

const hover = (selector: string): void => {
  fireEvent.pointerOver(at(selector), { buttons: 0 })
}

const root = (): Element => at('[data-slot="extend-root"]')

afterEach(() => {
  ctrl(false)
  cleanup()
})

// Two gestures start from the same two points and cannot both have them. The one a reader reaches for
// by default makes something; the one that changes what is already there asks for the key.
describe('what the handles are while Ctrl is held', () => {
  it('draws the creating handles with no key held', () => {
    shown(sizes())
    hover(`[data-item-id="${ITEM_1}"]`)

    expect(sideOf('end').getAttribute('data-sizing')).toBe('false')
  })

  it('swaps both for the resizing ones the moment the key goes down', () => {
    shown(sizes())
    hover(`[data-item-id="${ITEM_1}"]`)
    ctrl(true)

    expect(handles().map((one) => one.getAttribute('data-sizing'))).toEqual(['true', 'true'])
  })

  it('swaps them back when it is released', () => {
    shown(sizes())
    hover(`[data-item-id="${ITEM_1}"]`)
    ctrl(true)
    ctrl(false)

    expect(handles().map((one) => one.getAttribute('data-sizing'))).toEqual(['false', 'false'])
  })

  // Ctrl is half of every window-switching shortcut, so the common way to leave this page is with it
  // held — and the `keyup` is then delivered to whatever was switched to. Without this the board would
  // come back showing the resize handles with no key down, a state nothing could clear.
  it('forgets the key when the window loses focus, rather than coming back stuck', () => {
    shown(sizes())
    hover(`[data-item-id="${ITEM_1}"]`)
    ctrl(true)
    fireEvent.blur(window)

    expect(sideOf('end').getAttribute('data-sizing')).toBe('false')
  })

  // A surface that may create but not re-estimate keeps the plus and never gets the arrows, however
  // long the key is held: the modifier reveals a gesture, it does not grant one.
  it('offers no resizing handles at all on a surface that may change no estimate', () => {
    render(
      <PlanCanvas
        at={AT}
        draw={DRAWS}
        place={null}
        plan={planScreenModel(atlasPlan())}
        range={RANGE}
        rung="item"
        scale={SCALE}
        size={NO_SIZES}
      />,
    )
    hover(`[data-item-id="${ITEM_1}"]`)
    ctrl(true)

    expect(sideOf('end').getAttribute('data-sizing')).toBe('false')
  })
})

describe('what a Ctrl-held drag writes', () => {
  const drag = (side: 'start' | 'end', toX: number): void => {
    ctrl(true)
    fireEvent.pointerDown(sideOf(side), { clientX: 0, clientY: 26, pointerId: 1 })
    fireEvent.pointerMove(root(), { clientX: toX, clientY: 26, pointerId: 1 })
    fireEvent.pointerUp(root(), { clientX: toX, clientY: 26, pointerId: 1 })
  }

  it('re-estimates an item to the length its end was dragged to', () => {
    const writes = sizes()
    shown(writes)
    hover(`[data-item-id="${ITEM_1}"]`)
    drag('end', DAY * 6)

    expect(writes.estimateItem.mock.calls[0]?.[2]).toBe(6)
  })

  // Dragging a start handle leftwards lengthens the work. It does not move the mark leftwards: a
  // feature's start is the forward pass's to decide, so a drag can only ever be saying how long the
  // work is (`size-write.ts`).
  it('lengthens from the start handle too, the length and never a date being what is written', () => {
    const writes = sizes()
    shown(writes)
    hover(`[data-item-id="${ITEM_2}"]`)
    drag('start', 0)
    const asked = writes.estimateItem.mock.calls[0]?.[2]

    expect(typeof asked).toBe('number')
    expect(Number(asked)).toBeGreaterThan(0)
  })

  it('writes nothing for a drag back to the length the mark already had', () => {
    const writes = sizes()
    shown(writes)
    const mark = at(`[data-item-id="${ITEM_1}"]`)
    hover(`[data-item-id="${ITEM_1}"]`)
    drag('end', Number(mark.getAttribute('data-end-day')) * DAY)

    expect(writes.estimateItem.mock.calls).toEqual([])
  })

  it('never writes an estimate below the half day this product counts in', () => {
    const writes = sizes()
    shown(writes)
    hover(`[data-item-id="${ITEM_1}"]`)
    drag('end', -DAY * 50)

    expect(Number(writes.estimateItem.mock.calls[0]?.[2])).toBeGreaterThanOrEqual(0.5)
  })

  it('leaves the feature action alone when an item was the thing resized', () => {
    const writes = sizes()
    shown(writes)
    hover(`[data-item-id="${ITEM_1}"]`)
    drag('end', DAY * 6)

    expect(writes.estimateFeature.mock.calls).toEqual([])
  })
})

// ADR 0051: placement takes the children whenever one of them carries an estimate, so writing such a
// feature's own estimate is a real write that moves nothing on screen. The gesture is offered and
// refused rather than hidden, because a handle missing on some marks and not others is a rule nobody
// can infer from the board.
describe('a feature whose length is its items and not its own', () => {
  const grab = (toX: number): void => {
    hover(`[data-feature-id="${FEATURE_1}"]`)
    ctrl(true)
    fireEvent.pointerDown(sideOf('end'), { clientX: 0, clientY: 26, pointerId: 1 })
    fireEvent.pointerMove(root(), { clientX: toX, clientY: 26, pointerId: 1 })
  }

  it('refuses the resize, and paints the handle as refused', () => {
    shown(sizes())
    hover(`[data-feature-id="${FEATURE_1}"]`)
    ctrl(true)

    expect(sideOf('end').getAttribute('data-refused')).toBe('true')
  })

  it('says why on the chip rather than simply drawing nothing', () => {
    shown(sizes())
    grab(DAY * 12)

    expect(at('[data-slot="size-chip"]').textContent).toContain(BROKEN_DOWN)
  })

  it('writes nothing when it is let go', () => {
    const writes = sizes()
    shown(writes)
    grab(DAY * 12)
    fireEvent.pointerUp(root(), { clientX: DAY * 12, clientY: 26, pointerId: 1 })

    expect(writes.estimateFeature.mock.calls).toEqual([])
  })
})
