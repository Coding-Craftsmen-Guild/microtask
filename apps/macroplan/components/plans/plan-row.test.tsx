import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanRow } from './plan-row'
import { listRow, NOW, PLAN_A } from '../plan/testing/plan-fixture'

vi.mock('next/link', async () => ({
  default: (await import('../plan/testing/next-link')).LinkDouble,
}))

const show = (overrides: Parameters<typeof listRow>[0] = {}) =>
  render(<PlanRow now={NOW} plan={listRow(overrides)} />)

describe('PlanRow', () => {
  it('names the plan and opens it, from the name and from Open', () => {
    show()
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/plans/${PLAN_A}`,
      `/plans/${PLAN_A}`,
    ])
    expect(links.map((link) => link.textContent)).toEqual(['Atlas rollout', 'Open'])
  })

  it('counts the three things a list row may know, and the seats it was told about', () => {
    show()
    expect(screen.getByTestId('plan-counts').textContent).toBe(
      '1 epic · 2 features · 3 items · 3 share links',
    )
  })

  it('says the zero when a plan genuinely has no seats', () => {
    show({ shareLinkCount: 0 })
    expect(screen.getByTestId('plan-counts').textContent).toBe(
      '1 epic · 2 features · 3 items · 0 share links',
    )
  })

  it('renders nothing at all when the count was withheld, rather than a zero it was not told', () => {
    show({ shareLinkCount: undefined })
    expect(screen.getByTestId('plan-counts').textContent).toBe('1 epic · 2 features · 3 items')
  })

  it('singularises each count on its own', () => {
    show({ epicCount: 1, featureCount: 1, itemCount: 1, shareLinkCount: 1 })
    expect(screen.getByTestId('plan-counts').textContent).toBe(
      '1 epic · 1 feature · 1 item · 1 share link',
    )
  })

  it('counts nothing as nothing, for a plan with no rails at all', () => {
    show({ epicCount: 0, featureCount: 0, itemCount: 0, shareLinkCount: 0 })
    expect(screen.getByTestId('plan-counts').textContent).toBe(
      '0 epics · 0 features · 0 items · 0 share links',
    )
  })

  it('reads the settings line: the one date a plan carries, its sprint length and its zone', () => {
    show()
    expect(screen.getByTestId('plan-settings').textContent).toBe(
      'starts 2026-09-28 · 14-day sprints · Europe/Belgrade · updated 2h ago',
    )
  })

  it('measures the age against the pinned instant, and keeps the exact one in the markup', () => {
    show()
    const stamp = screen.getByText('2h ago')
    expect(stamp.tagName).toBe('TIME')
    expect(stamp.getAttribute('datetime')).toBe('2026-09-23T10:00:00.000Z')
  })

  it('carries no contents of the plan, which is the whole reason a list row exists', () => {
    show()
    expect(screen.queryByText('Auth rewrite')).toBeNull()
    expect(screen.queryByText('Sessions')).toBeNull()
  })
})
