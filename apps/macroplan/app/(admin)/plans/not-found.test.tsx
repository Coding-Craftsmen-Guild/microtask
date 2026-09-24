import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', async () => ({
  default: (await import('../../../components/plan/testing/next-link')).LinkDouble,
}))

const { default: PlanNotFound } = await import('./not-found')

// It sits on `plans` and no longer on `[planId]`, and that move is what makes it reachable at all.
// The plan read moved into `[planId]/layout.tsx`, `readPlan` answers a 404 or a 422 by calling
// `notFound()`, and a segment's own `not-found` element is rendered *inside* that segment's layout —
// so a `notFound()` thrown by the layout escapes to the nearest boundary above it. This is that
// boundary. A directory with no `layout.tsx` and no `page.tsx` still carries one: `create-component-
// tree.js` builds the segment's `LayoutRouter` with its `notFound` element before it checks whether
// the segment has a component of its own.
describe('a plan id that names nothing', () => {
  it('says the plan is not there, in one sentence for all three ways of arriving', () => {
    render(<PlanNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'Plan not found' })).toBeTruthy()
    expect(screen.getByText(/may have been deleted/)).toBeTruthy()
  })

  it('offers the index, which is where an admin finds out what is left', () => {
    render(<PlanNotFound />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })
})
