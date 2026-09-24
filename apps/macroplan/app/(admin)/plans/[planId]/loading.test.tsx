import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlanDrawerLoading from './loading'

describe('what a navigation to a feature shows before the drawer arrives', () => {
  it('announces that something is loading, for the reader who cannot see the canvas stay put', () => {
    render(<PlanDrawerLoading />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading')
  })

  it('is off screen rather than drawn, this app having no skeletons and no spinners anywhere', () => {
    render(<PlanDrawerLoading />)
    expect(screen.getByRole('status').getAttribute('class')).toBe('sr-only')
  })

  it('draws no panel, so nothing flashes where the drawer is about to be', () => {
    const { container } = render(<PlanDrawerLoading />)
    expect(container.querySelector('[data-slot="drawer-panel"]')).toBeNull()
    expect(container.querySelectorAll('*')).toHaveLength(1)
  })
})
