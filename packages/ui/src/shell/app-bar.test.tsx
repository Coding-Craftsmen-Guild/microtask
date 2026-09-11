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
})
