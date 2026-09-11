import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RelativeTime } from './relative-time'

const NOW = Date.parse('2020-05-05T12:00:00.000Z')

describe('RelativeTime', () => {
  it('renders the age its pure formatter computes from the passed instant', () => {
    const from = new Date(NOW - 3 * 60 * 60 * 1000).toISOString()
    const { container } = render(<RelativeTime from={from} now={NOW} />)
    expect(container.textContent).toBe('3h ago')
  })

  it('keeps the machine-readable timestamp on the element, so the exact instant survives', () => {
    const from = new Date(NOW - 60_000).toISOString()
    const { container } = render(<RelativeTime from={from} now={NOW} />)
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(from)
  })

  it('renders nothing at all for a missing timestamp, not the string "null"', () => {
    const { container } = render(<RelativeTime from={null} now={NOW} />)
    expect(container.innerHTML).toBe('')
  })

  it('never reads the clock: an instant years in the past still renders as minutes ago', () => {
    const from = new Date(NOW - 5 * 60_000).toISOString()
    const first = render(<RelativeTime from={from} now={NOW} />).container.textContent
    const second = render(<RelativeTime from={from} now={NOW} />).container.textContent
    expect(first).toBe('5m ago')
    expect(second).toBe(first)
  })
})
