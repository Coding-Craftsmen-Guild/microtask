import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanScreen } from './plan-screen'
import { atlasPlan, FEATURE_1, ITEM_1 } from './testing/plan-fixture'

const AT = new Date('2026-10-05T09:00:00.000Z')

const show = () => render(<PlanScreen at={AT} plan={atlasPlan()} />)

const radio = (name: string): HTMLInputElement => {
  const found = screen.getByRole('radio', { name })
  if (!(found instanceof HTMLInputElement)) throw new Error(`${name} is not an input`)
  return found
}

const classesOf = (element: Element | null | undefined): string =>
  element?.getAttribute('class') ?? ''

const tablePanel = (): Element | null =>
  screen.getByRole('table', { name: 'Table of Atlas rollout' }).parentElement

const scroller = (): Element | null => document.querySelector('.overflow-x-auto')

describe('the two renderings one plan screen holds', () => {
  it('mounts the canvas and the table at once, so neither is a view to be switched to', () => {
    show()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
  })

  it('names every feature and item in the table while the timeline is the selected view', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(screen.getByTestId(`row-${FEATURE_1}`)).toBeTruthy()
    expect(screen.getByTestId(`row-${ITEM_1}`)).toBeTruthy()
  })

  it('still heads the page with the plan’s name as a real heading', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
  })
})

describe('the switch between them', () => {
  it('offers the choice as one native radio group, so the screen needs no JavaScript to switch', () => {
    show()
    expect(radio('Timeline').getAttribute('name')).toBe('plan-view')
    expect(radio('Table').getAttribute('name')).toBe(radio('Timeline').getAttribute('name'))
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('describes the choice on both radios, rather than claiming a group the markup is not', () => {
    show()
    const hint = document.getElementById('plan-view-hint')
    expect(hint?.textContent).toContain('which rendering of this plan is on screen')
    for (const one of screen.getAllByRole('radio')) {
      expect(one.getAttribute('aria-describedby')).toBe('plan-view-hint')
    }
    expect(document.querySelectorAll('fieldset, [role="radiogroup"]')).toHaveLength(0)
  })

  it('starts on the timeline, which is the rendering §5 makes this product’s own', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(radio('Table').checked).toBe(false)
  })

  it('keeps each radio a sibling of both panels, because a peer variant is a sibling selector', () => {
    show()
    const parent = radio('Timeline').parentElement
    expect(parent).toBe(radio('Table').parentElement)
    expect(parent).toBe(scroller()?.parentElement)
    expect(parent).toBe(tablePanel()?.parentElement)
  })

  it('hides the canvas when the table is chosen, which costs a reader one img label', () => {
    show()
    expect(classesOf(scroller())).toContain('peer-checked/table:hidden')
  })

  it('never hides the table, only takes it off screen, so it never leaves the accessibility tree', () => {
    show()
    expect(classesOf(tablePanel())).toContain('peer-checked/timeline:sr-only')
    expect(classesOf(tablePanel()).split(' ').filter((one) => one.endsWith('hidden'))).toEqual([])
  })

  it('leaves the table outside the canvas’s own horizontal scroller', () => {
    show()
    expect(scroller()?.querySelector('table')).toBeNull()
    expect(document.querySelectorAll('.overflow-x-auto')).toHaveLength(1)
  })

  it('carries the switch on inputs the browser owns, so nothing here needs a state hook', () => {
    show()
    expect(radio('Timeline').getAttribute('type')).toBe('radio')
    expect(screen.getAllByRole('radio').map((one) => one.getAttribute('id'))).toEqual([
      'plan-view-timeline',
      'plan-view-table',
    ])
  })
})
