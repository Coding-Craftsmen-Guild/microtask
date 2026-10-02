import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import { PinField } from './pin-field'
import { SPRINT_WORDS } from './sprint-view'

type Pin = (planId: string, featureId: string, sprint: number | null) => Promise<ActionResult<Plan>>

const ATLAS = { startDate: '2026-09-28', sprintLengthDays: 14, timezone: 'Europe/Belgrade' }

const kept: Pin = () => Promise.resolve({ ok: true, value: atlasPlan() })

interface Setup {
  readonly pinSprint?: number | null
  readonly scheduledSprint?: number | null
  readonly sprintTotal?: number
  readonly pin?: Pin
}

const setup = (over: Setup = {}) => {
  const onPin = vi.fn(over.pin ?? kept)
  render(
    <PinField
      featureId={FEATURE_1}
      pin={onPin}
      pinSprint={over.pinSprint ?? null}
      planId={PLAN_A}
      scheduledSprint={over.scheduledSprint ?? 0}
      sprintLengthDays={ATLAS.sprintLengthDays}
      sprintTotal={over.sprintTotal ?? 4}
      startDate={ATLAS.startDate}
      timezone={ATLAS.timezone}
    />,
  )
  return { onPin, user: userEvent.setup() }
}

const value = () => screen.getByRole('button', { name: 'Sprint' })

const less = () => screen.getByRole('button', { name: SPRINT_WORDS.less })

const more = () => screen.getByRole('button', { name: SPRINT_WORDS.more })

describe('the sprint a feature is pinned to, as a stepper over a list of dates', () => {
  it('shows the pin and says it is pinned, counted from 1 as the table numbers them', () => {
    setup({ pinSprint: 2 })

    expect(value().textContent).toContain('S3')
    expect(value().textContent).toContain(SPRINT_WORDS.pinned)
  })

  it('shows the schedule’s own sprint where nothing is pinned, and says so', () => {
    setup({ pinSprint: null, scheduledSprint: 1 })

    expect(value().textContent).toContain('S2')
    expect(value().textContent).toContain(SPRINT_WORDS.loose)
  })

  it('is named by the caption above it, so the value is not a button called "S3"', () => {
    setup({ pinSprint: 2 })

    expect(value().getAttribute('aria-expanded')).toBe('false')
  })
})

describe('what the two buttons write', () => {
  it('pins one sprint later than what is on screen', async () => {
    const { onPin, user } = setup({ pinSprint: null, scheduledSprint: 1 })
    await user.click(more())

    expect(onPin).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, 2)
  })

  it('walks a pin down towards the sprint the schedule chose', async () => {
    const { onPin, user } = setup({ pinSprint: 4, scheduledSprint: 1 })
    await user.click(less())

    expect(onPin).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, 3)
  })

  // A pin below the scheduled sprint changes nothing at all, so clearing it is the real end of that
  // road rather than a stepper whose presses stop having an effect.
  it('clears the pin at the scheduled sprint rather than pinning below it', async () => {
    const { onPin, user } = setup({ pinSprint: 1, scheduledSprint: 1 })
    await user.click(less())

    expect(onPin).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, null)
  })

  it('disables the step down on a feature with no pin, there being nothing to clear', () => {
    setup({ pinSprint: null })

    expect(less().hasAttribute('disabled')).toBe(true)
  })

  it('disables the step up at the end of the list, so no press goes into silence', () => {
    setup({ pinSprint: 3, sprintTotal: 4 })

    expect(more().hasAttribute('disabled')).toBe(true)
  })
})

describe('the list, which is where a sprint becomes dates', () => {
  it('stays shut until the value is opened, the panel having no room for it otherwise', async () => {
    const { user } = setup()

    expect(screen.queryByRole('button', { name: /^S2/ })).toBeNull()
    await user.click(value())
    expect(screen.getByRole('button', { name: /^S2/ })).toBeTruthy()
  })

  it('says the days each sprint covers, which is the whole reason it exists', async () => {
    const { user } = setup()
    await user.click(value())

    expect(screen.getByRole('button', { name: /^S1/ }).textContent).toContain('2026-09-28')
  })

  it('writes the sprint a row names and shuts itself', async () => {
    const { onPin, user } = setup()
    await user.click(value())
    await user.click(screen.getByRole('button', { name: /^S3/ }))

    expect(onPin).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, 2)
    expect(screen.queryByRole('button', { name: /^S3/ })).toBeNull()
  })

  it('clears the pin from the Auto row, which is the same write as stepping off the floor', async () => {
    const { onPin, user } = setup({ pinSprint: 2 })
    await user.click(value())
    await user.click(screen.getByRole('button', { name: new RegExp(SPRINT_WORDS.auto) }))

    expect(onPin).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, null)
  })

  it('marks the sprints a pin could not reach rather than leaving them out of the list', async () => {
    const { user } = setup({ scheduledSprint: 2 })
    await user.click(value())

    expect(screen.getByRole('button', { name: /^S1/ }).textContent).toContain(SPRINT_WORDS.earlier)
  })
})

describe('what a reader is told when the server refuses', () => {
  it('says the API’s own sentence and keeps the field on screen', async () => {
    const { user } = setup({
      pin: () => Promise.resolve({ ok: false, status: 403, detail: 'Not permitted: feature:pin' }),
      pinSprint: null,
      scheduledSprint: 0,
    })
    await user.click(more())

    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:pin')
    expect(value()).toBeTruthy()
  })

  it('says so when the server never answers, leaving no rejection unhandled', async () => {
    const { user } = setup({ pin: () => Promise.reject(new TypeError('Failed to fetch')) })
    await user.click(more())

    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })
})
