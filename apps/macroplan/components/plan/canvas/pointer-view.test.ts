import { describe, expect, it } from 'vitest'
import { cardAt, CARD_GAP, dayAt, plainClick, scrollFor, stepRung, wheelZoom } from './pointer-view'

describe('stepRung', () => {
  it('steps toward the finest rung when the gesture is a zoom in', () => {
    expect(stepRung('epic', 'in')).toBe('feature')
    expect(stepRung('feature', 'in')).toBe('item')
  })

  it('steps toward the widest rung when the gesture is a zoom out', () => {
    expect(stepRung('item', 'out')).toBe('feature')
    expect(stepRung('feature', 'out')).toBe('epic')
  })

  it('answers nothing at either end, so a gesture past the last stop writes no cookie', () => {
    expect(stepRung('item', 'in')).toBeNull()
    expect(stepRung('epic', 'out')).toBeNull()
  })
})

describe('dayAt and scrollFor, which are each other’s inverse', () => {
  const scale = { axisX: 24, pxPerDay: 14 }

  it('answers the working day the pointer is over', () => {
    expect(dayAt({ ...scale, scrollLeft: 0, pointerOffset: 24 })).toBe(0)
    expect(dayAt({ ...scale, scrollLeft: 140, pointerOffset: 24 })).toBe(10)
    expect(dayAt({ ...scale, scrollLeft: 70, pointerOffset: 94 })).toBe(10)
  })

  it('puts the same day back under the same pixel at a different scale, which is the whole point', () => {
    const day = dayAt({ ...scale, scrollLeft: 280, pointerOffset: 300 })
    const wider = { axisX: 24, pxPerDay: 42 }
    expect(scrollFor({ ...wider, day, pointerOffset: 300 })).toBe(day * 42 + 24 - 300)
    expect(dayAt({ ...wider, scrollLeft: scrollFor({ ...wider, day, pointerOffset: 300 }), pointerOffset: 300 })).toBe(day)
  })

  it('never answers a negative scroll, which a browser would clamp and then disagree with us about', () => {
    expect(scrollFor({ ...scale, day: 0, pointerOffset: 900 })).toBe(0)
  })

  it('answers day zero for a scale of zero rather than an infinity', () => {
    expect(dayAt({ axisX: 0, pxPerDay: 0, scrollLeft: 100, pointerOffset: 0 })).toBe(0)
  })
})

describe('cardAt', () => {
  const card = { width: 200, height: 120 }

  const view = { viewWidth: 1000, viewHeight: 800 }

  it('sits below and to the right of the pointer, clear of the thing being pointed at', () => {
    expect(cardAt({ ...card, ...view, x: 100, y: 100 })).toEqual({
      left: 100 + CARD_GAP,
      top: 100 + CARD_GAP,
    })
  })

  it('flips to the left of the pointer rather than running off the right edge', () => {
    expect(cardAt({ ...card, ...view, x: 950, y: 100 }).left).toBe(950 - CARD_GAP - 200)
  })

  it('flips above the pointer rather than running off the bottom', () => {
    expect(cardAt({ ...card, ...view, x: 100, y: 760 }).top).toBe(760 - CARD_GAP - 120)
  })

  it('stays on screen in a viewport too small to flip into, rather than going off the other edge', () => {
    const tight = cardAt({ ...card, viewWidth: 160, viewHeight: 100, x: 150, y: 90 })
    expect(tight.left).toBe(0)
    expect(tight.top).toBe(0)
  })
})

describe('wheelZoom, which decides whether a wheel is a scroll or a zoom', () => {
  const plain = { ctrlKey: false, metaKey: false, overHeader: false }

  it('reads a modified wheel as a zoom wherever the pointer is', () => {
    expect(wheelZoom({ ...plain, ctrlKey: true, deltaY: -1 }, 'epic')).toEqual({ prevent: true, zooming: 'in' })
    expect(wheelZoom({ ...plain, metaKey: true, deltaY: 1 }, 'item')).toEqual({ prevent: true, zooming: 'out' })
  })

  it('reads a plain wheel over the header as a zoom, the ruler having nothing to scroll', () => {
    expect(wheelZoom({ ...plain, overHeader: true, deltaY: -1 }, 'epic')).toEqual({ prevent: true, zooming: 'in' })
  })

  it('leaves a plain wheel anywhere else to the browser, which is how a tall plan is scrolled', () => {
    expect(wheelZoom({ ...plain, deltaY: -1 }, 'epic')).toEqual({ prevent: false, zooming: null })
  })

  it('still swallows a modified wheel at the last stop, so the browser does not zoom the page instead', () => {
    expect(wheelZoom({ ...plain, ctrlKey: true, deltaY: -1 }, 'item')).toEqual({ prevent: true, zooming: null })
  })

  it('gives the scroll back over the header at the last stop, there being nothing to swallow it for', () => {
    expect(wheelZoom({ ...plain, overHeader: true, deltaY: -1 }, 'item')).toEqual({
      prevent: false,
      zooming: null,
    })
  })
})

describe('plainClick, which is what separates opening a drawer from opening a tab', () => {
  const click = { altKey: false, button: 0, ctrlKey: false, defaultPrevented: false, metaKey: false, shiftKey: false }

  it('takes an unmodified left click', () => {
    expect(plainClick(click)).toBe(true)
  })

  it('leaves every way a browser has of opening a link elsewhere alone', () => {
    for (const over of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
      expect(plainClick({ ...click, ...over }), JSON.stringify(over)).toBe(false)
    }
  })

  it('leaves a click something has already cancelled alone, which is what a drag leaves behind', () => {
    expect(plainClick({ ...click, defaultPrevented: true })).toBe(false)
  })
})
