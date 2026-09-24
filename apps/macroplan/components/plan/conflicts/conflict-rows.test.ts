import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  beaconPlan,
  FEATURE_1,
  FEATURE_2,
  ITEM_3,
  unplacedPlan,
} from '../testing/plan-fixture'
import { conflictRows, type ConflictPlan, type ConflictRow } from './conflict-rows'

const FEATURE_3 = '01MPFFFFFFFFFFFFFFFFFFFFF3'

const FEATURE_4 = '01MPFFFFFFFFFFFFFFFFFFFFF4'

const FEATURE_5 = '01MPFFFFFFFFFFFFFFFFFFFFF5'

const GHOST = '01MPFFFFFFFFFFFFFFFFFFFFF9'

const NAMES = [
  { id: FEATURE_1, name: 'Auth rewrite' },
  { id: FEATURE_2, name: 'Billing' },
  { id: FEATURE_3, name: 'Checkout' },
  { id: FEATURE_4, name: 'Reporting' },
  { id: FEATURE_5, name: 'Onboarding' },
]

const EMPTY = { spans: [], cycles: [], unscheduled: [], ignoredEdges: [] }

const planOf = (schedule: Partial<ConflictPlan['schedule']> = {}): ConflictPlan => ({
  features: NAMES,
  items: [{ id: ITEM_3, name: 'Invoices' }],
  schedule: { ...EMPTY, ...schedule },
})

// Every one of the four states at once, on one plan: a cycle between Checkout and Reporting, an
// edge from Billing to Auth rewrite the pass set aside to keep rail order, Onboarding with nothing
// sized, and the two cycle members plus one item dragged off the axis with them.
const tangled = (): ConflictPlan =>
  planOf({
    spans: [{ id: FEATURE_2, startDay: 0, endDay: 3 }],
    cycles: [{ featureIds: [FEATURE_3, FEATURE_4] }],
    unscheduled: [
      { id: FEATURE_5, reason: 'no-estimate' },
      { id: FEATURE_3, reason: 'in-cycle' },
      { id: FEATURE_4, reason: 'in-cycle' },
      { id: ITEM_3, reason: 'in-cycle' },
    ],
    ignoredEdges: [{ featureId: FEATURE_2, dependsOnId: FEATURE_1 }],
  })

const inSection = (rows: readonly ConflictRow[], section: ConflictRow['section']) =>
  rows.filter((row) => row.section === section)

const only = (rows: readonly ConflictRow[], section: ConflictRow['section']): ConflictRow => {
  const found = inSection(rows, section)
  const first = found[0]
  if (first === undefined || found.length !== 1) {
    throw new Error('expected exactly one ' + section + ' row, got ' + String(found.length))
  }
  return first
}

// The one unscheduled row naming `id`, found by the subject it names rather than by its key, so
// the cycle row that also mentions that feature's id cannot be what a lookup answers.
const unplacedSentence = (rows: readonly ConflictRow[], id: string): string | undefined =>
  inSection(rows, 'unscheduled').find((row) => row.subjects[0]?.id === id)?.sentence

describe('a plan that does not contradict itself', () => {
  it('answers no rows at all, so the list renders nothing rather than three empty headings', () => {
    expect(conflictRows(atlasPlan())).toEqual([])
    expect(conflictRows(beaconPlan())).toEqual([])
  })

  it('answers none for a plan whose schedule is empty but whose features are not', () => {
    expect(conflictRows(planOf())).toEqual([])
  })
})

describe('the three sections, counted before they are read', () => {
  it('turns every cycle, every ignored edge and every unscheduled entry into exactly one row', () => {
    const one = tangled()
    const rows = conflictRows(one)
    expect(rows).toHaveLength(6)
    expect(inSection(rows, 'cycle')).toHaveLength(one.schedule.cycles.length)
    expect(inSection(rows, 'ignored-edge')).toHaveLength(one.schedule.ignoredEdges.length)
    expect(inSection(rows, 'unscheduled')).toHaveLength(one.schedule.unscheduled.length)
  })

  it('gives every row a key of its own, so a section can be rendered as a keyed list', () => {
    const ids = conflictRows(tangled()).map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves a feature that is only unplaced out of the cycle and ignored-edge sections', () => {
    const rows = conflictRows(planOf({ unscheduled: [{ id: FEATURE_5, reason: 'no-estimate' }] }))
    expect(rows.map((row) => row.section)).toEqual(['unscheduled'])
  })
})

describe('a cycle, which is the section a user has to act on', () => {
  it('names every feature caught in it, not just the one the cycle happens to start at', () => {
    const row = only(conflictRows(tangled()), 'cycle')
    expect(row.subjects.map((subject) => subject.id)).toEqual([FEATURE_3, FEATURE_4])
    expect(row.sentence).toBe('Checkout and Reporting wait on each other, so neither was placed.')
  })

  it('reads as a list once more than two features are caught in it', () => {
    const rows = conflictRows(
      planOf({ cycles: [{ featureIds: [FEATURE_1, FEATURE_2, FEATURE_3] }] }),
    )
    expect(only(rows, 'cycle').sentence).toBe(
      'Auth rewrite, Billing and Checkout wait on each other, so none of them was placed.',
    )
  })
})

describe('an ignored edge, which is a placed feature and never an unplaced one', () => {
  it('says the feature was placed and that its dependency was the thing set aside', () => {
    const row = only(conflictRows(tangled()), 'ignored-edge')
    expect(row.subjects.map((subject) => subject.id)).toEqual([FEATURE_2, FEATURE_1])
    expect(row.sentence).toBe(
      'Billing was placed, but its dependency on Auth rewrite was set aside to keep rail order.',
    )
  })

  it('says nothing about it being unplaced, which is the sentence it must not be confused with', () => {
    expect(only(conflictRows(tangled()), 'ignored-edge').sentence).not.toContain('not placed')
    expect(only(conflictRows(tangled()), 'ignored-edge').sentence).not.toContain('left off')
  })
})

describe('the two reasons a thing is unscheduled, which are two different sentences', () => {
  it('says nothing was sized for no-estimate, which is the one a user can fix on the spot', () => {
    expect(unplacedSentence(conflictRows(tangled()), FEATURE_5)).toBe(
      'Onboarding has no estimate, so it was left off the timeline.',
    )
  })

  it('blames the cycle for in-cycle, and says it of an item the cycle dragged down too', () => {
    const rows = conflictRows(tangled())
    expect(unplacedSentence(rows, FEATURE_3)).toBe(
      'Checkout was left off the timeline by a dependency cycle.',
    )
    expect(unplacedSentence(rows, ITEM_3)).toBe(
      'Invoices was left off the timeline by a dependency cycle.',
    )
  })

  it('never collapses the two into one sentence, which would hide which one is fixable', () => {
    const sentenceFor = (reason: 'no-estimate' | 'in-cycle') =>
      unplacedSentence(conflictRows(planOf({ unscheduled: [{ id: FEATURE_5, reason }] })), FEATURE_5)
    expect(sentenceFor('no-estimate')).not.toBe(sentenceFor('in-cycle'))
    expect(sentenceFor('no-estimate')).toContain('no estimate')
    expect(sentenceFor('in-cycle')).toContain('dependency cycle')
  })
})

describe('an id the plan does not hold, which is a schedule and a plan disagreeing', () => {
  it('answers a row rather than throwing, and keeps it in the section the schedule put it in', () => {
    const rows = conflictRows(planOf({ unscheduled: [{ id: GHOST, reason: 'no-estimate' }] }))
    expect(rows.map((row) => row.section)).toEqual(['unscheduled'])
  })

  it('falls back to the raw id and marks the subject unknown, so the id stays debuggable', () => {
    const rows = conflictRows(planOf({ unscheduled: [{ id: GHOST, reason: 'no-estimate' }] }))
    const row = only(rows, 'unscheduled')
    expect(row.subjects).toEqual([{ id: GHOST, name: GHOST, known: false }])
    expect(row.sentence).toContain(GHOST)
  })

  it('says so in a note, so the row reads as a bug rather than a ULID somebody named a feature', () => {
    const rows = conflictRows(
      planOf({ ignoredEdges: [{ featureId: FEATURE_2, dependsOnId: GHOST }] }),
    )
    expect(only(rows, 'ignored-edge').note).toBe(
      'The schedule names an id this plan does not hold, so the two disagree.',
    )
  })

  it('leaves the note null on a row whose every id the plan holds', () => {
    for (const row of conflictRows(tangled())) expect(row.note).toBeNull()
  })

  it('names the members it can when one of a cycle is missing, rather than dropping the cycle', () => {
    const rows = conflictRows(planOf({ cycles: [{ featureIds: [FEATURE_1, GHOST] }] }))
    const row = only(rows, 'cycle')
    expect(row.subjects.map((subject) => subject.known)).toEqual([true, false])
    expect(row.sentence).toBe(
      'Auth rewrite and ' + GHOST + ' wait on each other, so neither was placed.',
    )
  })
})

describe('what a caller may hand it', () => {
  it('takes a whole Plan and the page model that cannot carry a share token, with no adapter', () => {
    const one = unplacedPlan('in-cycle')
    expect(conflictRows(one)).toHaveLength(2)
    expect(conflictRows(planScreenModel(one))).toEqual(conflictRows(one))
  })

  it('names the fixture feature and its item by name, which is what the id could never do', () => {
    const rows = conflictRows(unplacedPlan('no-estimate'))
    expect(rows.map((row) => row.sentence)).toEqual([
      'Billing has no estimate, so it was left off the timeline.',
      'Invoices has no estimate, so it was left off the timeline.',
    ])
  })
})
