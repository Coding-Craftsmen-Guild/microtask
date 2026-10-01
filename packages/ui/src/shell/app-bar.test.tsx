import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppBar } from './app-bar'

describe('AppBar', () => {
  it('renders the two-line lockup with the product over the CC Guild line', () => {
    render(<AppBar product="Microtask" />)
    expect(screen.getByText('Microtask')).toBeTruthy()
    expect(screen.getByText('CC Guild')).toBeTruthy()
  })

  it('is the same shell for a second product, so nothing hardcodes Microtask', () => {
    const { container } = render(<AppBar product="Macroplan" />)
    expect(container.textContent).toBe('MacroplanCC Guild')
  })

  it('links the lockup home by default and wherever a caller says otherwise', () => {
    const { container, rerender } = render(<AppBar product="Microtask" />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/')
    rerender(<AppBar product="Microtask" href="/projects" />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/projects')
  })

  it('puts caller actions in a slot after the lockup', () => {
    render(
      <AppBar product="Microtask">
        <button type="button">Sign out</button>
      </AppBar>,
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('renders a caller-supplied logo beside the lockup and omits the slot without one', () => {
    const { container, rerender } = render(<AppBar product="Microtask" />)
    expect(container.querySelector('img')).toBeNull()
    rerender(<AppBar product="Microtask" logo={<img alt="CC Guild logo" src="/logo.webp" />} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('CC Guild logo')
  })

  it('takes the gold underline that separates the bar from the page', () => {
    const { container } = render(<AppBar product="Microtask" />)
    expect(container.firstElementChild?.className).toContain('border-gold')
  })

  it('paints legacy’s indigo ground, which is the whole reason the brand token exists', () => {
    const { container } = render(<AppBar product="Microtask" />)
    const bar = container.firstElementChild?.className ?? ''
    expect(bar).toContain('bg-brand')
    expect(bar).toContain('text-white')
  })

  it('gilds the CC GUILD line and leaves the product line white, as the lockup is drawn', () => {
    render(<AppBar product="Microtask" />)
    expect(screen.getByText('CC Guild').className).toContain('text-gold')
    expect(screen.getByText('Microtask').className).not.toContain('text-gold')
  })

  it('pushes caller actions to the far end with a flexible spacer, not up against the lockup', () => {
    const { container } = render(
      <AppBar product="Microtask">
        <button type="button">Sign out</button>
      </AppBar>,
    )
    const children = [...(container.querySelector('header > div')?.children ?? [])]
    expect(children.map((node) => node.tagName)).toEqual(['A', 'SPAN', 'BUTTON'])
    expect(children[1]?.className).toContain('flex-1')
  })

  it('aligns its own row with the page container at legacy’s 900px', () => {
    const { container } = render(<AppBar product="Microtask" />)
    expect(container.querySelector('header > div')?.className).toContain('max-w-[900px]')
  })
it('runs its row to the viewport edges for width="wide", so the lockup is not mid-page', () => {
    const { container } = render(<AppBar product="Macroplan" width="wide" />)
    const classes = container.querySelector('header > div')?.className ?? ''
    expect(classes).not.toContain('max-w-[900px]')
    expect(classes).not.toContain('mx-auto')
  })

  it('keeps its own padding at either width, so the bar never runs flush to the glass', () => {
    for (const width of ['column', 'wide'] as const) {
      const { container } = render(<AppBar product="Macroplan" width={width} />)
      expect(container.querySelector('header > div')?.className).toContain('px-5')
    }
  })

  it('renders a caller-supplied trail after the lockup, behind a divider', () => {
    const { container } = render(
      <AppBar crumbs={<nav aria-label="Breadcrumb">Plans</nav>} product="Macroplan" width="wide" />,
    )
    const children = [...(container.querySelector('header > div')?.children ?? [])]
    expect(children.map((node) => node.tagName)).toEqual(['A', 'SPAN', 'NAV', 'SPAN'])
    expect(children[1]?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws no divider for a bar with no trail, which is what the other product renders', () => {
    const { container } = render(<AppBar product="Microtask" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('keeps the lockup whole when a long trail runs out of room beside it', () => {
    const { container } = render(<AppBar crumbs={<nav>x</nav>} product="Macroplan" width="wide" />)
    expect(container.querySelector('header > div > a')?.className).toContain('shrink-0')
  })
})
