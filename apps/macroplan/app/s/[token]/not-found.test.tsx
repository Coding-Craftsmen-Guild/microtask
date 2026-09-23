import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SeatPlanNotFound from './not-found'

describe('a seat page’s not-found', () => {
  it('says the plan is gone, in words that do not name the link', () => {
    render(<SeatPlanNotFound />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plan not found')
    expect(screen.getByText(/no longer there/)).toBeTruthy()
  })

  it('does not say the link is unavailable, which is a different answer at a different URL', () => {
    const { container } = render(<SeatPlanNotFound />)
    expect(container.textContent).not.toContain('This share link is no longer available.')
  })

  it('offers no way onward, because a seat has no list to be sent to and / is a password form', () => {
    const { container } = render(<SeatPlanNotFound />)
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelector('form')).toBeNull()
  })
})
