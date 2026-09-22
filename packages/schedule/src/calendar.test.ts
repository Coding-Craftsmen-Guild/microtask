import { describe, expect, it } from 'vitest'
import type { PlanCalendar } from './structure.js'
import { dateToDay, dayToDate, isWorkingDay, todayIn } from './calendar.js'

const MS_PER_DAY = 86_400_000

const plan = (startDate: string, timezone = 'UTC'): PlanCalendar => ({
  startDate,
  sprintLengthDays: 10,
  timezone,
})

/** Monday 2026-09-21 through Sunday 2026-09-27, the week every weekday case is drawn from. */
const MONDAY = plan('2026-09-21')
const SATURDAY = plan('2026-09-26')

const gap = (earlier: string, later: string): number =>
  (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_PER_DAY

const run = (calendar: PlanCalendar, count: number): readonly string[] =>
  Array.from({ length: count }, (_unused, day) => dayToDate(day, calendar))

/** The hour an instant reads as in a zone, used only to prove a DST transition is real. */
const hourIn = (timezone: string, instant: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })
    .format(new Date(instant))

describe('a working day is Monday through Friday, because holidays do not exist here', () => {
  it('answers true for each weekday of one week and false for its Saturday and Sunday', () => {
    expect(
      [
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
      ].map(isWorkingDay),
    ).toEqual([true, true, true, true, true, false, false])
  })

  it('does not care what month, year or leap day the date falls on', () => {
    expect(isWorkingDay('2028-02-29')).toBe(true)
    expect(isWorkingDay('2027-12-31')).toBe(true)
    expect(isWorkingDay('2028-01-01')).toBe(false)
  })
})

describe('day 0 is the start date, or the first working day after it', () => {
  it('places day 0 on the start date itself for a start on any of the five weekdays', () => {
    for (const date of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']) {
      expect(dayToDate(0, plan(date))).toBe(date)
    }
  })

  it('places day 0 on the following Monday for a Saturday start and for a Sunday start', () => {
    expect(dayToDate(0, plan('2026-09-26'))).toBe('2026-09-28')
    expect(dayToDate(0, plan('2026-09-27'))).toBe('2026-09-28')
  })

  it('makes five working days exactly one calendar week from a Monday start', () => {
    expect(dayToDate(5, MONDAY)).toBe('2026-09-28')
    expect(gap('2026-09-21', dayToDate(5, MONDAY))).toBe(7)
  })

  it('walks Monday to Friday and then jumps the weekend', () => {
    expect(run(MONDAY, 7)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-28',
      '2026-09-29',
    ])
  })
})

describe('an offset survives the trip out to a date and back', () => {
  it('round trips every offset in 0..400 from a Monday start', () => {
    for (let day = 0; day <= 400; day += 1) {
      expect(dateToDay(dayToDate(day, MONDAY), MONDAY)).toBe(day)
    }
  })

  it('round trips every offset in 0..400 from a Saturday start, whose day 0 is a Monday', () => {
    for (let day = 0; day <= 400; day += 1) {
      expect(dateToDay(dayToDate(day, SATURDAY), SATURDAY)).toBe(day)
    }
  })

  it('never lands a non-negative offset on a weekend', () => {
    for (const date of run(MONDAY, 401)) expect(isWorkingDay(date)).toBe(true)
  })
})

describe('a weekend date answers the offset of the Monday after it', () => {
  it('gives a Saturday, its Sunday and the Monday after them one shared offset', () => {
    const monday = dateToDay('2026-09-28', MONDAY)
    expect(monday).toBe(5)
    expect(dateToDay('2026-09-26', MONDAY)).toBe(monday)
    expect(dateToDay('2026-09-27', MONDAY)).toBe(monday)
  })

  it('is the one direction that does not round trip: a weekend date comes back as its Monday', () => {
    expect(dayToDate(dateToDay('2026-09-26', MONDAY), MONDAY)).toBe('2026-09-28')
    expect(dayToDate(dateToDay('2026-09-28', MONDAY), MONDAY)).toBe('2026-09-28')
  })

  it('rounds a weekend forward even when it sits before the plan starts', () => {
    expect(dateToDay('2026-09-19', MONDAY)).toBe(dateToDay('2026-09-21', MONDAY))
    expect(dateToDay('2026-09-19', MONDAY)).toBe(0)
  })
})

describe('negative offsets count backwards through working days', () => {
  it('steps a Monday start back over the weekend to the Friday before', () => {
    expect(dayToDate(-1, MONDAY)).toBe('2026-09-18')
    expect(dayToDate(-5, MONDAY)).toBe('2026-09-14')
    expect(dayToDate(-6, MONDAY)).toBe('2026-09-11')
  })

  it('steps back from the anchor, not the start date, so a Saturday start has days before it', () => {
    expect(dayToDate(-1, SATURDAY)).toBe('2026-09-25')
    expect(gap(dayToDate(-1, SATURDAY), SATURDAY.startDate)).toBe(1)
  })

  it('round trips negative offsets too, because every offset lands on a working day', () => {
    for (let day = -200; day < 0; day += 1) {
      expect(dateToDay(dayToDate(day, MONDAY), MONDAY)).toBe(day)
      expect(dateToDay(dayToDate(day, SATURDAY), SATURDAY)).toBe(day)
    }
  })
})

describe('a year boundary and a leap day are ordinary steps', () => {
  it('crosses 31 December 2027 into January 2028 without a gap', () => {
    expect(run(plan('2027-12-31'), 2)).toEqual(['2027-12-31', '2028-01-03'])
  })

  it('crosses 31 December 2028 into January 2029 without a gap', () => {
    expect(run(plan('2028-12-29'), 2)).toEqual(['2028-12-29', '2029-01-01'])
  })

  it('counts 29 February 2028 as one working day, no more and no less', () => {
    expect(run(plan('2028-02-25'), 4)).toEqual([
      '2028-02-25',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })

  it('advances by one day inside a week and three across a weekend, for 400 days running', () => {
    const dates = run(plan('2027-03-01'), 401)
    const gaps = new Set(dates.slice(1).map((date, index) => gap(dates[index] ?? '', date)))
    expect([...gaps].sort()).toEqual([1, 3])
  })
})

describe('a DST transition is a non-event, because the arithmetic never leaves UTC', () => {
  const start = plan('2027-03-01')
  const belgrade = plan('2027-03-01', 'Europe/Belgrade')
  const dates = run(belgrade, 251)

  it('spans a real spring transition and a real autumn one in Europe/Belgrade', () => {
    expect(hourIn('Europe/Belgrade', '2027-03-27T12:00:00Z'))
      .not.toBe(hourIn('Europe/Belgrade', '2027-03-28T12:00:00Z'))
    expect(hourIn('Europe/Belgrade', '2027-10-30T12:00:00Z'))
      .not.toBe(hourIn('Europe/Belgrade', '2027-10-31T12:00:00Z'))
    expect(dates).toEqual(expect.arrayContaining(['2027-03-26', '2027-03-29', '2027-10-29', '2027-11-01']))
  })

  it('produces the same dates in Belgrade as in UTC, every day of the range', () => {
    expect(dates).toEqual(run(start, 251))
  })

  it('reads the same offset back for a date whichever zone the plan claims', () => {
    for (const date of ['2027-03-26', '2027-03-29', '2027-10-29', '2027-11-01']) {
      expect(dateToDay(date, belgrade)).toBe(dateToDay(date, start))
    }
  })
})

describe("today is asked of the plan's zone, never of the server's", () => {
  const instant = new Date('2026-09-22T11:00:00Z')

  it('answers one instant with two dates, fourteen hours ahead and eleven behind', () => {
    expect(todayIn('Pacific/Kiritimati', instant)).toBe('2026-09-23')
    expect(todayIn('Pacific/Niue', instant)).toBe('2026-09-22')
  })

  it('answers UTC itself, and pads to the shape the other two functions parse', () => {
    expect(todayIn('UTC', instant)).toBe('2026-09-22')
    expect(todayIn('Europe/Belgrade', new Date('2027-01-05T09:00:00Z'))).toBe('2027-01-05')
    expect(isWorkingDay(todayIn('UTC', new Date('2026-09-26T00:00:00Z')))).toBe(false)
  })

  it('refuses an unresolvable zone rather than quietly drawing the plan in UTC', () => {
    expect(() => todayIn('Not/AZone', instant)).toThrow(RangeError)
  })
})
