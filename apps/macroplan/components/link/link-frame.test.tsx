import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COLUMN } from '@repo/ui/shell/page'
import { LINK_UNAVAILABLE_PATH } from '../../lib/routes'
import { SEAT_TOKEN } from '../plan/testing/plan-fixture'
import { LinkFrame } from './link-frame'

const HOME = `/s/${SEAT_TOKEN}`

const frame = (home = HOME) =>
  render(
    <LinkFrame home={home}>
      <p>the plan</p>
    </LinkFrame>,
  )

describe('the seat surface’s frame', () => {
  it('points the brand lockup wherever it was told, and at nothing else', () => {
    const { container } = frame()
    expect([...container.querySelectorAll('a')].map((one) => one.getAttribute('href'))).toEqual([
      HOME,
    ])
  })

  it('takes the terminal page’s own path as home too, so that page links to itself', () => {
    const { container } = frame(LINK_UNAVAILABLE_PATH)
    expect(container.querySelector('a')?.getAttribute('href')).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('carries no Sign out and no form, because this surface has no session', () => {
    const { container } = frame()
    expect(container.textContent).not.toContain('Sign out')
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('renders the page in the main landmark the shared shell supplies', () => {
    frame()
    expect(screen.getByRole('main').textContent).toBe('the plan')
  })

  it('takes the wide page, for the same timeline the admin surface goes wide for', () => {
    frame()
    expect(screen.getByRole('main').getAttribute('class')).not.toContain('max-w-[900px]')
    expect(COLUMN).toContain('max-w-[900px]')
  })

  it('names Macroplan and carries the CC Guild mark', () => {
    frame()
    expect(screen.getByAltText('CC Guild logo').getAttribute('src')).toBe('/img/logo.webp')
    expect(screen.getByRole('banner').textContent).toContain('Macroplan')
  })
})
