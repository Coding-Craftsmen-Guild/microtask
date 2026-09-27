import { MAX_SPRINT_LENGTH_DAYS } from '@repo/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { INPUT, SPRINT, TIMING_WORDS, TimingFields } from './timing-fields'

const setup = () => {
  const onStart = vi.fn()
  const onSprint = vi.fn()
  const onZone = vi.fn()
  render(
    <TimingFields
      onSprint={onSprint}
      onStart={onStart}
      onZone={onZone}
      sprintLengthDays={10}
      startDate="2026-01-05"
      timezone="UTC"
    />,
  )
  return { onStart, onSprint, onZone, user: userEvent.setup() }
}

describe('TimingFields', () => {
  it('takes the start date as a date input, so the browser supplies YYYY-MM-DD', () => {
    setup()
    expect(screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.start).type).toBe('date')
  })

  // The stepper must not be able to offer a length the API refuses, and this is the only thing holding the
  // two together: `@repo/contracts` is a server dependency of this app, so a client component cannot import
  // `LIMITS` — the bounds are repeated in `SPRINT` and pinned here instead.
  it('bounds the sprint by the contract’s own cap, not by a number chosen here', () => {
    setup()
    const field = screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.sprint)
    expect(Number(field.max)).toBe(MAX_SPRINT_LENGTH_DAYS)
    expect(Number(field.min)).toBe(1)
    expect(SPRINT).toEqual({ min: 1, max: MAX_SPRINT_LENGTH_DAYS })
  })

  // `fireEvent` and not `userEvent`, because these fields are **controlled by the form above them** and
  // this test renders them without one: `value` never moves, so a typed keystroke is replayed against a
  // field still showing 10 and the last call is arithmetic on whatever the browser assembled. One change
  // event carrying the whole value is what actually asks the question here, which is whether the string an
  // input gives is converted to a number before it leaves.
  it('answers a sprint length as a number rather than the string an input gives', () => {
    const { onSprint } = setup()
    fireEvent.change(screen.getByLabelText(TIMING_WORDS.sprint), { target: { value: '14' } })
    expect(onSprint).toHaveBeenCalledExactlyOnceWith(14)
  })

  it('answers the start date and the zone as the strings they are, converting neither', () => {
    const { onStart, onZone } = setup()
    fireEvent.change(screen.getByLabelText(TIMING_WORDS.start), { target: { value: '2026-02-02' } })
    fireEvent.change(screen.getByLabelText(TIMING_WORDS.zone), { target: { value: 'Europe/Belgrade' } })
    expect(onStart).toHaveBeenCalledExactlyOnceWith('2026-02-02')
    expect(onZone).toHaveBeenCalledExactlyOnceWith('Europe/Belgrade')
  })

  // A text field and not a select, deliberately: `Timezone` accepts any name this runtime's `Intl` can
  // resolve, and a hand-written list of zone names in a client would be free to drift from the tz database
  // Node ships the moment either side is upgraded.
  it('takes the timezone as free text, so no list here can fall behind the tz database', () => {
    setup()
    const field = screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.zone)
    expect(field.type).toBe('text')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  // Every class spelled out, because Tailwind's scanner reads class names as text: one assembled at a call
  // site is never generated, so the field would be unstyled in a build and correct in a test.
  it('holds every input class as a whole literal, composing none of them', () => {
    for (const value of Object.values(INPUT)) {
      expect(value).toContain('rounded-md')
      expect(value).not.toContain('${')
    }
  })
})
