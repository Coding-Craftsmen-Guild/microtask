import type { Rung } from '@repo/canvas'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1 } from '../testing/plan-fixture'
import { detailsOf, splitDetail } from './detail-lines'
import { PlanCanvas } from './plan-canvas'
import { PlanPointer } from './plan-pointer'
import { SETTLE_MS } from './pointer-view'

const pushed: string[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
}))

const asked: string[] = []

const zoomTo = async (rung: string): Promise<void> => {
  asked.push(rung)
}

const DETAIL = detailsOf(planScreenModel(atlasPlan()))

const detailOf = (id: string): string => DETAIL.get(id) ?? ''

const board = () => (
  <div data-slot="plan-board">
    <div data-detail={detailOf(FEATURE_1)} data-hover-id={FEATURE_1} data-slot="sidebar-row">
      Auth rewrite
    </div>
    <div data-slot="time-header">
      <span data-slot="quarter-head">Q4 2026</span>
    </div>
    <div data-slot="timeline-scroller">
      <svg data-slot="plan-canvas">
        <rect data-detail={detailOf(FEATURE_1)} data-hover-id={FEATURE_1} data-slot="feature-bar" />
        <rect data-detail={detailOf(ITEM_1)} data-hover-id={FEATURE_1} data-slot="item-mark" />
        <rect data-detail={detailOf(FEATURE_2)} data-hover-id={FEATURE_2} data-slot="feature-bar" />
        <path data-arc-from={FEATURE_1} data-arc-to={FEATURE_2} data-slot="arc" />
        <a data-slot="feature-link" href={`/plans/p/f/${FEATURE_1}`}>
          <rect data-hover-id={FEATURE_1} data-slot="feature-bar" />
        </a>
      </svg>
    </div>
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
    expect(pushed).toEqual([`/plans/p/f/${FEATURE_1}`])
  })

  it('drills from the quarter rung too', async () => {
    show({ rung: 'feature' })
    fireEvent.click(at('[data-slot="feature-link"] rect'))
    await act(async () => {})
    expect(asked).toEqual(['item'])
  })

  it('leaves the link to the browser at the sprint rung, so it still middle-clicks and opens in a tab', () => {
    show({ rung: 'item' })
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true })
    at('[data-slot="feature-link"] rect').dispatchEvent(event)
    expect(asked).toEqual([])
    expect(pushed).toEqual([])
    expect(event.defaultPrevented).toBe(false)
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
  it('draws the title and every line the mark carried', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    const detail = splitDetail(detailOf(FEATURE_1))
    expect(card()?.textContent).toContain(detail.title)
    for (const line of detail.lines) {
      expect(card()?.textContent, line.label).toContain(line.value)
    }
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

  it('clears every light when the pointer leaves, leaving no mark stuck on', () => {
    show()
    fireEvent.pointerOver(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    fireEvent.pointerOut(at('[data-slot="feature-bar"]'), { clientX: 100, clientY: 100 })
    expect(lit()).toEqual([])
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
