import type { Rung } from '@repo/canvas'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1 } from '../testing/plan-fixture'
import { detailsOf, splitDetail } from './detail-lines'
import { PlanCanvas } from './plan-canvas'
import { PlanPointer } from './plan-pointer'
import { DRILL_INSET } from './use-drill'
import { SETTLE_MS } from './pointer-view'

const pushed: string[] = []

// The stack the mocked query answers with, which is what a click on a mark adds to.
let opened = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  useSearchParams: () => new URLSearchParams(opened),
}))

const asked: string[] = []

const zoomTo = async (rung: string): Promise<void> => {
  asked.push(rung)
}

const DETAIL = detailsOf(planScreenModel(atlasPlan()))

const detailOf = (id: string): string => DETAIL.get(id) ?? ''

const FIT_DAY = 30

const MARK_DAY = 90

const board = () => (
  <div data-slot="plan-board">
    <div data-slot="group-chips">
      <label data-fit-day={0} data-fit-rung="feature">
        All work
      </label>
      <label data-fit-day={FIT_DAY} data-fit-rung="item" data-slot="group-chip">
        Phase 1
      </label>
      <label data-slot="group-chip">Phase 2</label>
    </div>
    <div data-detail={detailOf(FEATURE_1)} data-hover-id={FEATURE_1} data-slot="sidebar-row">
      Auth rewrite
    </div>
    <div data-slot="time-header">
      <span data-slot="quarter-head">Q4 2026</span>
    </div>
    <svg data-slot="plan-canvas">
      <rect data-detail={detailOf(FEATURE_1)} data-hover-id={FEATURE_1} data-slot="feature-bar" />
      <rect data-detail={detailOf(ITEM_1)} data-hover-id={FEATURE_1} data-slot="item-mark" />
      <rect data-detail={detailOf(FEATURE_2)} data-hover-id={FEATURE_2} data-slot="feature-bar" />
      <path data-arc-from={FEATURE_1} data-arc-to={FEATURE_2} data-slot="arc" />
      <a data-slot="feature-link" href={`/plans/p/f/${FEATURE_1}`}>
        <rect data-hover-id={FEATURE_1} data-slot="feature-bar" data-start-day={MARK_DAY} />
      </a>
    </svg>
  </div>
)

const show = (over: { rung?: Rung; zoom?: ((rung: string) => Promise<void>) | null } = {}) =>
  render(
    <PlanPointer
      axisX={0}
      pxPerDay={14}
      rung={over.rung ?? 'epic'}
      zoomTo={over.zoom === undefined ? zoomTo : over.zoom}
    >
      {board()}
    </PlanPointer>,
  )

const at = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const lit = (): readonly string[] =>
  [...document.querySelectorAll('[data-lit]')].map((one) => one.getAttribute('data-slot') ?? '')

const near = (): readonly string[] =>
  [...document.querySelectorAll('[data-near]')].map((one) => one.getAttribute('data-hover-id') ?? '')

const hovering = (): boolean => document.querySelector('[data-hovering]') !== null

// happy-dom's `WheelEvent` constructor drops `ctrlKey` and `metaKey` from its init dictionary — it
// carries `deltaY` and the `MouseEvent` coordinates and not the modifier state — so an event built the
// ordinary way arrives with both undefined and every zoom gesture below would read as a plain scroll.
// Defining them afterwards is patching the **environment** and not the component: what the handler reads
// is `event.ctrlKey`, which is what a browser sets and what this sets, and the alternative is leaving
// the one gesture item 4 is actually about untested.
const wheelEvent = (init: WheelEventInit & { readonly ctrlKey?: boolean; readonly metaKey?: boolean }) => {
  const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  for (const key of ['ctrlKey', 'metaKey'] as const) {
    Object.defineProperty(event, key, { value: init[key] ?? false })
  }
  return event
}

const wheelOn = (selector: string, init: Parameters<typeof wheelEvent>[0]): void => {
  at(selector).dispatchEvent(wheelEvent(init))
}

const settle = () => {
  act(() => {
    vi.advanceTimersByTime(SETTLE_MS + 1)
  })
}

const card = (): Element | null => document.querySelector('[data-slot="hover-card"]')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  pushed.length = 0
  asked.length = 0
})

describe('zooming on a wheel', () => {
  it('steps one rung finer for a wheel toward the screen while a modifier is held', () => {
    show({ rung: 'epic' })
    wheelOn('[data-slot="plan-canvas"]', { ctrlKey: true, deltaY: -120 })
    settle()
    expect(asked).toEqual(['feature'])
  })

  it('steps one rung wider the other way, and takes the Cmd key as well as Ctrl', () => {
    show({ rung: 'item' })
    wheelOn('[data-slot="plan-canvas"]', { deltaY: 120, metaKey: true })
    settle()
    expect(asked).toEqual(['feature'])
  })

  it('leaves a plain wheel over the canvas alone, because that is how a tall plan is scrolled', () => {
    show({ rung: 'epic' })
    wheelOn('[data-slot="plan-canvas"]', { deltaY: -120 })
    settle()
    expect(asked).toEqual([])
  })

  it('zooms on a plain wheel over the time header, which has nothing of its own to scroll', () => {
    show({ rung: 'epic' })
    wheelOn('[data-slot="quarter-head"]', { deltaY: -120 })
    settle()
    expect(asked).toEqual(['feature'])
  })

  it('fires once for a flick, not once per event, so one gesture is one round trip', () => {
    show({ rung: 'epic' })
    for (const notch of [0, 1, 2, 3, 4]) wheelOn('[data-slot="plan-canvas"]', { ctrlKey: true, deltaY: -40 - notch })
    settle()
    expect(asked).toEqual(['feature'])
  })

  it('writes nothing at the finest rung, so scrolling past the last stop costs the server nothing', () => {
    show({ rung: 'item' })
    wheelOn('[data-slot="plan-canvas"]', { ctrlKey: true, deltaY: -120 })
    settle()
    expect(asked).toEqual([])
  })

  it('prevents the default, which is the browser zooming the whole page instead of the plan', () => {
    show({ rung: 'epic' })
    const event = wheelEvent({ ctrlKey: true, deltaY: -120 })
    at('[data-slot="plan-canvas"]').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the page’s own zoom alone for a gesture it is not going to act on', () => {
    show({ rung: 'epic' })
    const event = wheelEvent({ deltaY: -120 })
    at('[data-slot="plan-canvas"]').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('does nothing at all on a surface with no zoom to write, rather than swallowing the scroll', () => {
    show({ rung: 'epic', zoom: null })
    const event = wheelEvent({ ctrlKey: true, deltaY: -120 })
    at('[data-slot="plan-canvas"]').dispatchEvent(event)
    settle()
    expect(event.defaultPrevented).toBe(false)
    expect(asked).toEqual([])
  })
})

describe('clicking a mark at a rung that is not the finest', () => {
  it('drills to the sprint rung and then opens the feature, in that order', async () => {
    show({ rung: 'epic' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    await act(async () => {})
    expect(asked).toEqual(['item'])
    expect(pushed).toEqual([`/plans/p/f/${FEATURE_1}?open=f:${FEATURE_1}`])
  })

  it('drills from the quarter rung too', async () => {
    show({ rung: 'feature' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    await act(async () => {})
    expect(asked).toEqual(['item'])
  })

  // The half that was missing. Sprint is ten times the Year stop's scale, so a mark clicked at day 90
  // sits at 360px on the axis it was clicked on and at 3,780px on the one that arrives: the drill
  // landed on a pane still showing day zero, with the feature the reader had just pointed at a
  // scrollbar away. The day is read off the mark and spent through the same anchor the wheel uses.
  it('scrolls to the mark that was clicked, once the finer scale has arrived', async () => {
    const { rerender } = show({ rung: 'epic' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    await act(async () => {})
    rerender(
      <PlanPointer axisX={0} pxPerDay={42} rung="item" zoomTo={zoomTo}>
        {board()}
      </PlanPointer>,
    )
    expect(at('[data-slot="plan-board"]').scrollLeft).toBe(MARK_DAY * 42 - DRILL_INSET)
  })

  // At the finest stop there is no redraw to wait for and nothing to re-anchor: the click opens the
  // drawer over the canvas already on screen, and moving the pane under it would be a scroll the
  // reader did not ask for.
  it('moves nothing when it opens at the sprint rung, there being no scale change to follow', () => {
    show({ rung: 'item' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    expect(at('[data-slot="plan-board"]').scrollLeft).toBe(0)
  })

  // The href on a mark cannot carry the open tabs — the board is drawn by a layout, and a layout cannot
  // read the query — so a plain click is taken over at every rung and the stack added to it here.
  it('takes a plain click over at the sprint rung too, where there is nothing to drill', () => {
    show({ rung: 'item' })
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
    at('[data-slot="feature-link"] rect').dispatchEvent(event)
    expect(asked).toEqual([])
    expect(pushed).toEqual([`/plans/p/f/${FEATURE_1}?open=f:${FEATURE_1}`])
    expect(event.defaultPrevented).toBe(true)
  })

  // A middle click and a modified click are the browser's own, and they open the bare route: one subject,
  // no stack, which is what opening a link in a new tab means everywhere.
  it('leaves a modified click to the browser, so it still opens in a new tab', () => {
    show({ rung: 'item' })
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    at('[data-slot="feature-link"] rect').dispatchEvent(event)
    expect(pushed).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('adds the subject to the stack the query already holds, rather than replacing it', () => {
    opened = 'open=i:ITEM-ZERO'
    show({ rung: 'item' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    expect(pushed).toEqual([`/plans/p/f/${FEATURE_1}?open=i:ITEM-ZERO,f:${FEATURE_1}`])
    opened = ''
  })

  it('takes over the navigation when it drills, so the drawer opens over the rung that was asked for', () => {
    show({ rung: 'epic' })
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
    at('[data-slot="feature-link"] rect').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a click that is not on a mark alone', () => {
    show({ rung: 'epic' })
    fireEvent.click(at('[data-slot="quarter-head"]'))
    expect(asked).toEqual([])
    expect(pushed).toEqual([])
  })
})

describe('the card a hover puts up', () => {
  it('draws the context, the title, every fact and the dates the mark carried', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    const detail = splitDetail(detailOf(FEATURE_1))
    expect(card()?.textContent).toContain(detail.context)
    expect(card()?.textContent).toContain(detail.title)
    for (const fact of detail.facts) {
      expect(card()?.textContent, fact.label).toContain(fact.value)
    }
  })

  // The one line on the card that is not a fact about the plan, and it earns its place: a bar is a
  // link with `tabIndex={-1}` inside a `role="img"`, so nothing else on the board says that pointing
  // at a mark and clicking it opens the thing.
  it('promises that clicking opens it, which nothing else on the board says', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(card()?.textContent).toContain('Click to open')
  })

  it('shows the item’s own card over an item tick, not the feature’s', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="item-mark"]'), { clientX: 100, clientY: 100 })
    expect(card()?.textContent).toContain(splitDetail(detailOf(ITEM_1)).title)
  })

  it('puts up nothing until a pointer reaches something that carries a card', () => {
    show()
    expect(card()).toBeNull()
    fireEvent.pointerOver(at('[data-slot="quarter-head"]'), { clientX: 10, clientY: 10 })
    expect(card()).toBeNull()
  })

  it('takes it down when the pointer leaves', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(card()).toBeTruthy()
    fireEvent.pointerOut(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(card()).toBeNull()
  })

  it('hides it from a screen reader, the table being where these facts are readable', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(card()?.getAttribute('aria-hidden')).toBe('true')
  })

  // The title was `truncate`, which mattered little while a bar carried its own name and matters a
  // great deal now that it does not: this is the only place on the board a name appears in full, and
  // a card that cut it off would make the gesture that replaced the labels worse than the labels.
  it('wraps a long title onto another line rather than cutting it off at the card’s edge', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    const title = card()?.querySelector('[data-slot="hover-title"]')
    expect(title?.className).not.toContain('truncate')
    expect(title?.className).toContain('break-words')
    expect(title?.textContent).toBe(splitDetail(detailOf(FEATURE_1)).title)
  })
})

describe('what a hover lights', () => {
  it('lights every part of the feature’s thread and the arcs at either end of it', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(lit().toSorted()).toEqual(['arc', 'feature-bar', 'feature-bar', 'item-mark', 'sidebar-row'])
  })

  it('lights the same thread from an item tick, the row in the tree included', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="item-mark"]'), { clientX: 100, clientY: 100 })
    expect(lit()).toContain('sidebar-row')
    expect(lit()).toContain('item-mark')
  })

  it('leaves the other feature’s bar dark', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    const others = [...document.querySelectorAll(`[data-hover-id="${FEATURE_2}"]`)]
    expect(others.length).toBeGreaterThan(0)
    for (const one of others) expect(one.getAttribute('data-lit')).toBeNull()
  })

  // The board dims around the thread, so the three levels are three attributes: the thread is lit, the
  // features at the other end of its arcs are kept, and the root says a hover is happening at all.
  it('keeps the feature at the other end of an arc, without lighting it', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(near()).toEqual([FEATURE_2])
    expect(hovering()).toBe(true)
  })

  it('says a hover is happening, which is what dims everything else', () => {
    show()
    expect(hovering()).toBe(false)
    fireEvent.pointerOver(at('[data-slot="item-mark"]'), { clientX: 100, clientY: 100 })
    expect(hovering()).toBe(true)
  })

  it('clears every light when the pointer leaves, leaving no mark stuck on', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    fireEvent.pointerOut(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(lit()).toEqual([])
    expect(near()).toEqual([])
    expect(hovering()).toBe(false)
  })
})

describe('over the canvas the server really renders, rather than a fixture of one', () => {
  it('finds a bar, its card and its thread through the same selectors', () => {
    render(
      <PlanPointer axisX={0} pxPerDay={14} rung="item" zoomTo={zoomTo}>
        <PlanCanvas at={new Date('2026-10-05T09:00:00.000Z')} place={null} plan={planScreenModel(atlasPlan())} rung="item" />
      </PlanPointer>,
    )
    fireEvent.pointerOver(at(`[data-slot="feature-bar"][data-hover-id="${FEATURE_1}"]`), {
      clientX: 100,
      clientY: 100,
    })
    expect(card()?.textContent).toContain('Auth rewrite')
    expect(lit()).toContain('item-mark')
  })
})

describe('fitting the view to a group when its chip is clicked', () => {
  const chip = (which: number): Element => {
    const found = [...document.querySelectorAll('[data-slot="group-chip"]')][which]
    if (found === undefined) throw new Error('no chip')
    return found
  }

  const scroller = (): HTMLElement => at('[data-slot="plan-board"]') as HTMLElement

  it('asks for the stop the chip names, which is the one the whole group fits at', () => {
    show({ rung: 'epic' })
    fireEvent.click(chip(0))
    expect(asked).toEqual(['item'])
  })

  it('writes no zoom when the group already fits at the stop on screen, and scrolls anyway', () => {
    show({ rung: 'item' })
    fireEvent.click(chip(0))
    expect(asked).toEqual([])
    expect(scroller().scrollLeft).toBe(FIT_DAY * 14)
  })

  it('puts the group’s first day at the left edge once the new scale has arrived', () => {
    const { rerender } = show({ rung: 'epic' })
    fireEvent.click(chip(0))
    rerender(
      <PlanPointer axisX={0} pxPerDay={42} rung="item" zoomTo={zoomTo}>
        {board()}
      </PlanPointer>,
    )
    expect(scroller().scrollLeft).toBe(FIT_DAY * 42)
  })

  it('does nothing for a chip carrying no fit, a group with nothing placed having no window', () => {
    show({ rung: 'epic' })
    fireEvent.click(chip(1))
    expect(asked).toEqual([])
    expect(scroller().scrollLeft).toBe(0)
  })

  // The chip is a `<label>` for a radio and that is the whole of how a group is selected (ADR 0064).
  // Preventing the default here would make a click that moves the view fail to select the group it
  // moved to, which is the one thing this gesture must not do.
  it('never prevents the default, so the click that moves the view is the one that selected', () => {
    show({ rung: 'epic' })
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
    chip(0).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves a chip alone on a surface with no zoom to write, rather than scrolling it half way', () => {
    show({ rung: 'epic', zoom: null })
    fireEvent.click(chip(0))
    expect(asked).toEqual([])
  })
})

// `All work` is the one chip that is not a group, so it carries no `data-slot="group-chip"` — it is a
// bare label beside the radio that clears the choice. It still has to widen the view again, or a
// reader who looked at a fortnight and then asked for everything stays zoomed into the fortnight.
describe('clearing the choice with the All work chip', () => {
  const allChip = (): Element => at('[data-slot="group-chips"] label[data-fit-rung="feature"]')

  it('takes the plan back to its own opening fit, at day zero', () => {
    show({ rung: 'item' })
    fireEvent.click(allChip())
    expect(asked).toEqual(['feature'])
  })

  it('scrolls back to the start when the stop it asks for is the one already drawn', () => {
    show({ rung: 'feature' })
    at('[data-slot="plan-board"]').scrollLeft = 900
    fireEvent.click(allChip())
    expect(asked).toEqual([])
    expect(at('[data-slot="plan-board"]').scrollLeft).toBe(0)
  })
})
