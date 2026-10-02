import { describe, expect, it } from 'vitest'
import { sprintChoices, sprintValue, stepPin, SPRINT_WORDS } from './sprint-view'

const ATLAS = { startDate: '2026-09-28', sprintLengthDays: 14, timezone: 'Europe/Belgrade' }

const standing = (pinSprint: number | null, scheduledSprint: number | null) => ({
  pinSprint,
  scheduledSprint,
})

describe('what the sprint stepper shows, and where the number came from', () => {
  it('shows the pin where there is one, which is the number the buttons step', () => {
    expect(sprintValue(standing(2, 0))).toEqual({ label: 'S3', mode: SPRINT_WORDS.pinned })
  })

  it('shows the schedule’s own sprint where nothing is pinned, and says it is not pinned', () => {
    expect(sprintValue(standing(null, 0))).toEqual({ label: 'S1', mode: SPRINT_WORDS.loose })
  })

  // Both `null` is work the forward pass could not place at all — no estimate, or a cycle — and a
  // number there would be a sprint nobody chose.
  it('shows a dash for work nothing placed, rather than S1', () => {
    expect(sprintValue(standing(null, null))).toEqual({
      label: String.fromCharCode(0x2014),
      mode: SPRINT_WORDS.nowhere,
    })
  })

  it('counts sprints from 1, as the table and the board label them', () => {
    expect(sprintValue(standing(0, 0)).label).toBe('S1')
    expect(sprintValue(standing(7, 0)).label).toBe('S8')
  })
})

describe('where one press of the stepper lands', () => {
  it('pins one sprint later than what is on screen, from an unpinned feature', () => {
    expect(stepPin(1, standing(null, 2), 8)).toBe(3)
  })

  it('pins one later than the pin where there is one', () => {
    expect(stepPin(1, standing(3, 2), 8)).toBe(4)
  })

  it('walks the pin down towards the sprint the schedule chose', () => {
    expect(stepPin(-1, standing(5, 2), 8)).toBe(4)
    expect(stepPin(-1, standing(3, 2), 8)).toBe(2)
  })

  // A pin at or below the scheduled sprint changes nothing: the forward pass folds a pin into a
  // `max()`. So the only honest end of that road is no pin at all, one press further.
  it('clears the pin at the scheduled sprint rather than walking below it', () => {
    expect(stepPin(-1, standing(2, 2), 8)).toBeNull()
    expect(stepPin(-1, standing(1, 2), 8)).toBeNull()
  })

  it('answers nothing for a press down on a feature with no pin, there being nothing to clear', () => {
    expect(stepPin(-1, standing(null, 2), 8)).toBeUndefined()
  })

  it('answers nothing for a press up at the end of the list, so no button presses into silence', () => {
    expect(stepPin(1, standing(7, 0), 8)).toBeUndefined()
  })

  it('steps up from zero for work the schedule could not place, there being no floor to read', () => {
    expect(stepPin(1, standing(null, null), 8)).toBe(1)
  })
})

describe('the list of sprints, which is where the dates are', () => {
  it('opens with the row that clears the pin, naming the sprint the schedule chose', () => {
    const [auto] = sprintChoices(standing(2, 0), 3, ATLAS)

    expect(auto?.sprint).toBeNull()
    expect(auto?.label).toBe(SPRINT_WORDS.auto)
    expect(auto?.when).toBe(`${SPRINT_WORDS.autoWhen} (S1)`)
  })

  it('says only what Auto means where the schedule placed nothing', () => {
    const [auto] = sprintChoices(standing(null, null), 2, ATLAS)

    expect(auto?.when).toBe(SPRINT_WORDS.autoWhen)
  })

  it('ticks the row the feature is pinned to, and Auto where it is not pinned', () => {
    const pinned = sprintChoices(standing(1, 0), 3, ATLAS)
    const loose = sprintChoices(standing(null, 0), 3, ATLAS)

    expect(pinned.filter((row) => row.picked).map((row) => row.label)).toEqual(['S2'])
    expect(loose.filter((row) => row.picked).map((row) => row.label)).toEqual([SPRINT_WORDS.auto])
  })

  it('offers one row per sprint after Auto, in order, counted from 1', () => {
    expect(sprintChoices(standing(null, 0), 3, ATLAS).map((row) => row.label)).toEqual([
      SPRINT_WORDS.auto,
      'S1',
      'S2',
      'S3',
    ])
  })

  it('carries each sprint’s own days, that being the only way to answer "when is S3"', () => {
    const rows = sprintChoices(standing(null, 0), 3, ATLAS)

    expect(rows[1]?.when).toContain('2026-09-28')
    expect(rows[2]?.when).not.toBe(rows[1]?.when)
  })

  // Offered and marked rather than hidden: the question is "can I start it in S1", and the honest
  // answer is that a pin cannot move a feature earlier — not an S1 that is missing from the list.
  it('marks the sprints earlier than the schedule’s answer rather than leaving them out', () => {
    const rows = sprintChoices(standing(null, 2), 4, ATLAS)

    expect(rows.filter((row) => row.earlier).map((row) => row.label)).toEqual(['S1', 'S2'])
  })

  it('marks none where the schedule placed nothing, there being no answer to be earlier than', () => {
    expect(sprintChoices(standing(null, null), 4, ATLAS).some((row) => row.earlier)).toBe(false)
  })

  it('answers Auto alone for a total of none, rather than throwing on a plan with no sprints', () => {
    expect(sprintChoices(standing(null, 0), 0, ATLAS)).toHaveLength(1)
  })
})
