import { describe, expect, it } from 'vitest'
import type { PlanCalendar } from './structure.js'
import { dateToDay, isWorkingDay } from './calendar.js'
import { rangeOfSprint, sprintOf } from './sprints.js'

const plan = (sprintLengthDays: number, startDate = '2026-09-21'): PlanCalendar => ({
  startDate,
  sprintLengthDays,
  timezone: 'UTC',
})

const TEN = plan(10)

describe('sprintOf groups working-day offsets into fixed-width bands', () => {
  it('puts days 0 through 9 in sprint 0 and day 10 in sprint 1, for a ten-day sprint', () => {
    for (let day = 0; day <= 9; day += 1) expect(sprintOf(day, TEN)).toBe(0)
    expect(sprintOf(10, TEN)).toBe(1)
  })

  it('answers -1 for day -1, never folding a pre-start pin onto sprint 0', () => {
    expect(sprintOf(-1, TEN)).toBe(-1)
  })

  it('treats a one-day sprint as one sprint per working day', () => {
    const ONE = plan(1)
    for (let day = 0; day <= 40; day += 1) expect(sprintOf(day, ONE)).toBe(day)
  })
})

describe('rangeOfSprint spans the working days of one sprint, both ends inclusive', () => {
  it('runs sprint 0 from a Monday start through the Friday of the week after', () => {
    expect(rangeOfSprint(0, TEN)).toEqual({ from: '2026-09-21', to: '2026-10-02' })
  })

  it('always ends a sprint on a working day, for sprints 0 through 40', () => {
    for (let sprint = 0; sprint <= 40; sprint += 1) {
      expect(isWorkingDay(rangeOfSprint(sprint, TEN).to)).toBe(true)
    }
  })

  it('round trips: the offset of a sprint’s own start date maps back to that sprint', () => {
    for (let sprint = 0; sprint <= 40; sprint += 1) {
      const { from } = rangeOfSprint(sprint, TEN)
      expect(sprintOf(dateToDay(from, TEN), TEN), `sprint ${sprint}`).toBe(sprint)
    }
  })

  it('gives a one-day sprint the same single working day at both ends', () => {
    const ONE = plan(1)
    expect(rangeOfSprint(3, ONE)).toEqual({ from: '2026-09-24', to: '2026-09-24' })
  })
})
