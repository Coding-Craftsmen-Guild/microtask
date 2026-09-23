import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { PlanList } from './plan-list'
import { listRow, NOW, PLAN_A, PLAN_B } from '../plan/testing/plan-fixture'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-testid': testId,
  }: {
    href: string
    children: ReactNode
    className?: string
    'data-testid'?: string
  }) => (
    <a className={className} data-testid={testId} href={href}>
      {children}
    </a>
  ),
}))

const TWO = [
  listRow(),
  listRow({
    id: PLAN_B,
    name: 'Beacon migration',
    startDate: '2026-10-05',
    sprintLengthDays: 7,
    timezone: 'UTC',
    epicCount: 0,
    featureCount: 0,
    itemCount: 0,
    shareLinkCount: 0,
    updatedAt: '2026-09-22T12:00:00.000Z',
  }),
]

describe('PlanList', () => {
  it('says there are no plans yet, rather than drawing an empty grid', () => {
    render(<PlanList now={NOW} plans={[]} />)
    expect(screen.getByText('No plans yet — there is nothing to open.')).toBeTruthy()
  })

  it('draws one row per plan, in the order it was handed them', () => {
    render(<PlanList now={NOW} plans={TWO} />)
    expect(screen.getAllByTestId('plan-name').map((one) => one.textContent)).toEqual([
      'Atlas rollout',
      'Beacon migration',
    ])
  })

  it('does not re-sort what the API already ordered', () => {
    render(<PlanList now={NOW} plans={[...TWO].reverse()} />)
    expect(screen.getAllByTestId('plan-name').map((one) => one.textContent)).toEqual([
      'Beacon migration',
      'Atlas rollout',
    ])
  })

  it('links every row to its own plan page', () => {
    render(<PlanList now={NOW} plans={TWO} />)
    expect(screen.getAllByTestId('plan-name').map((one) => one.getAttribute('href'))).toEqual([
      `/plans/${PLAN_A}`,
      `/plans/${PLAN_B}`,
    ])
  })

  it('dates every row against the one instant it was given', () => {
    render(<PlanList now={NOW} plans={TWO} />)
    expect(screen.getAllByTestId('plan-settings').map((one) => one.textContent)).toEqual([
      'starts 2026-09-28 · 14-day sprints · Europe/Belgrade · updated 2h ago',
      'starts 2026-10-05 · 7-day sprints · UTC · updated 1d ago',
    ])
  })

  it('shows no empty state once there is a single plan', () => {
    render(<PlanList now={NOW} plans={[listRow()]} />)
    expect(screen.queryByText('No plans yet — there is nothing to open.')).toBeNull()
  })
})
