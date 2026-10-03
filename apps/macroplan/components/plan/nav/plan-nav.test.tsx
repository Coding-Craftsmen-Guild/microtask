import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanLink, PlanNavProvider, SHALLOW } from './plan-nav'

afterEach(() => vi.restoreAllMocks())

const link = (go = vi.fn(), replace = false) => {
  render(
    <PlanNavProvider value={{ go }}>
      <PlanLink href="/plans/P/f/F1" replace={replace}>
        Auth rewrite
      </PlanLink>
    </PlanNavProvider>,
  )
  return { go, anchor: screen.getByRole('link', { name: 'Auth rewrite' }) }
}

describe('PlanLink opens one of the plan’s own addresses without a request', () => {
  it('is a real link to the address, so it can be opened elsewhere', () => {
    expect(link().anchor.getAttribute('href')).toBe('/plans/P/f/F1')
  })

  it('takes a plain click over and goes there itself', () => {
    const { go, anchor } = link()
    const followed = fireEvent.click(anchor, { button: 0 })
    expect(go).toHaveBeenCalledWith('/plans/P/f/F1', { replace: false })
    expect(followed).toBe(false)
  })

  it('replaces the entry when it is asked to', () => {
    const { go, anchor } = link(vi.fn(), true)
    fireEvent.click(anchor, { button: 0 })
    expect(go).toHaveBeenCalledWith('/plans/P/f/F1', { replace: true })
  })

  it('leaves a modified click to the browser, which is how a new tab is opened', () => {
    const { go, anchor } = link()
    fireEvent.click(anchor, { button: 0, ctrlKey: true })
    expect(go).not.toHaveBeenCalled()
  })
})

describe('SHALLOW moves through history and asks the server nothing', () => {
  it('pushes an entry, or replaces the current one', () => {
    const pushed = vi.spyOn(window.history, 'pushState')
    const replaced = vi.spyOn(window.history, 'replaceState')
    SHALLOW.go('/plans/P/i/I1')
    SHALLOW.go('/plans/P', { replace: true })
    expect(pushed).toHaveBeenCalledWith(null, '', '/plans/P/i/I1')
    expect(replaced).toHaveBeenCalledWith(null, '', '/plans/P')
  })
})
