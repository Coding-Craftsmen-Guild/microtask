import { describe, expect, it } from 'vitest'
import { EstimateDays } from './plan.js'
import { ScheduleSpan, ScheduleView } from './schedule-view.js'

const ID = '01M240ERCRWWCN16Q5AH000001'

const span = (startDay: number, endDay: number) => ({ id: ID, startDay, endDay })

/**
 * The grain of a span and the grain of an estimate are one decision, and this is what holds them to
 * it.
 *
 * A span is a sum of estimates: the forward pass places a feature at `endDay = startDay + estimate`
 * and queues the next one behind it. So the moment an estimate could be a half, a span could be —
 * and while `ScheduleSpan` still said `int()`, the API served a schedule that failed its own
 * contract. Nothing refused it on the way out; the *client* refused to decode the response, and the
 * plan page reported that Macroplan could not reach its API.
 *
 * That is the failure this file exists to catch, because no other test round-tripped a fractional
 * estimate through the schedule it produces.
 */
describe('a span is measured in the same grain an estimate is', () => {
  it('takes the half day an estimate can now be', () => {
    expect(ScheduleSpan.safeParse(span(0, 0.5)).success).toBe(true)
    expect(ScheduleSpan.safeParse(span(1.5, 3)).success).toBe(true)
  })

  it('takes a whole day, which most spans still are', () => {
    expect(ScheduleSpan.safeParse(span(0, 4)).success).toBe(true)
  })

  // A span is a sum of estimates and nothing else, so an offset off the half-day grid is a schedule
  // arrived at by some route the domain does not have.
  it('refuses a finer grain, which no sum of estimates could have produced', () => {
    expect(ScheduleSpan.safeParse(span(0, 0.25)).success).toBe(false)
    expect(ScheduleSpan.safeParse(span(0.1, 1)).success).toBe(false)
  })

  it('accepts every grain an estimate accepts, which is the property that keeps the two in step', () => {
    for (const days of [0, 0.5, 1, 1.5, 2, 7.5]) {
      expect(EstimateDays.safeParse(days).success, `estimate ${String(days)}`).toBe(true)
      expect(ScheduleSpan.safeParse(span(0, days)).success, `span ${String(days)}`).toBe(true)
    }
  })
})

describe('a whole schedule carrying half days decodes', () => {
  it('parses the shape a half-day plan actually produces, spans and all', () => {
    const view = {
      spans: [span(0, 1.5), { id: ID, startDay: 1.5, endDay: 3 }],
      cycles: [],
      unscheduled: [],
      ignoredEdges: [],
    }
    expect(ScheduleView.safeParse(view).success).toBe(true)
  })
})
