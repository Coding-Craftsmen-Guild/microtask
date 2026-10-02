import { describe, expect, it } from 'vitest'
import { aimOf, draftOf, DRAWN_NAMES, type Drawn, type DrawnAt } from './extend-view'

const SPRINT = 10

const ITEM: Drawn = {
  epicId: 'rail-one',
  featureId: 'feature-one',
  kind: 'item',
  labelId: 'phase-one',
  name: 'Sessions',
  originDay: 6,
  position: 1,
  side: 'end',
  subjectId: 'item-one',
}

const FEATURE: Drawn = { ...ITEM, kind: 'feature', name: 'Auth rewrite', subjectId: 'feature-one' }

const at = (over: Partial<DrawnAt> = {}): DrawnAt => ({
  before: 0,
  day: 9,
  epicId: 'rail-one',
  lane: 0,
  railName: 'Platform',
  ...over,
})

describe('the span a drag draws', () => {
  it('runs forward from an end handle to the pointer', () => {
    const aim = aimOf(ITEM, at({ day: 9 }), SPRINT)

    expect(aim.fromDay).toBe(6)
    expect(aim.toDay).toBe(9)
    expect(aim.days).toBe(3)
  })

  it('runs backward from a start handle, the pointer being the free edge either way', () => {
    const aim = aimOf({ ...ITEM, originDay: 6, side: 'start' }, at({ day: 3 }), SPRINT)

    expect(aim.fromDay).toBe(3)
    expect(aim.toDay).toBe(6)
  })

  it('snaps the free edge to half days, which is the grain this product estimates in', () => {
    expect(aimOf(ITEM, at({ day: 8.3 }), SPRINT).toDay).toBe(8.5)
    expect(aimOf(ITEM, at({ day: 8.1 }), SPRINT).toDay).toBe(8)
  })

  // The first pixel of the gesture has to draw something, or the bar appears out of nowhere once the
  // pointer has travelled far enough to round up.
  it('keeps at least half a day however little the pointer has moved', () => {
    expect(aimOf(ITEM, at({ day: 6 }), SPRINT).days).toBe(0.5)
    expect(aimOf({ ...ITEM, side: 'start' }, at({ day: 6 }), SPRINT).days).toBe(0.5)
  })

  it('never draws a bar before day zero, there being no such day', () => {
    const aim = aimOf({ ...ITEM, originDay: 1, side: 'start' }, at({ day: -4 }), SPRINT)

    expect(aim.fromDay).toBe(0)
    expect(aim.toDay).toBe(1)
  })

  it('refuses to be dragged through its own origin, which would invert the bar', () => {
    const aim = aimOf(ITEM, at({ day: 2 }), SPRINT)

    expect(aim.fromDay).toBe(6)
    expect(aim.toDay).toBe(6.5)
  })
})

describe('what the chip says, which is the whole of what a release will do', () => {
  it('names the item a new one goes after, in the same lane', () => {
    expect(aimOf(ITEM, at(), SPRINT).chip).toContain(DRAWN_NAMES.item)
    expect(aimOf(ITEM, at(), SPRINT).chip).toContain('after')
    expect(aimOf(ITEM, at(), SPRINT).chip).toContain('Sessions')
  })

  it('says before for a start handle, which is the other end of the same sentence', () => {
    expect(aimOf({ ...ITEM, side: 'start' }, at(), SPRINT).chip).toContain('before')
  })

  it('names a feature for a feature, the two making different things', () => {
    expect(aimOf(FEATURE, at(), SPRINT).chip).toContain(DRAWN_NAMES.feature)
  })

  // Crossing lanes changes what gets made, so it changes what the chip says: a rail, and which way the
  // dependency will run.
  it('names the rail and the dependency once the lane differs', () => {
    const aim = aimOf(ITEM, at({ epicId: 'rail-two', lane: 1, railName: 'Payments' }), SPRINT)

    expect(aim.chip).toContain('Payments')
    expect(aim.chip).toContain('waits for')
    expect(aim.sameLane).toBe(false)
  })

  it('says unblocks for a start handle across lanes, the edge running the other way', () => {
    const aim = aimOf(
      { ...ITEM, side: 'start' },
      at({ day: 2, epicId: 'rail-two', lane: 1, railName: 'Payments' }),
      SPRINT,
    )

    expect(aim.chip).toContain('unblocks')
  })

  it('measures it in days and in sprints, which is the chip’s second half', () => {
    expect(aimOf(ITEM, at({ day: 9 }), SPRINT).meta).toBe('3d · S1')
  })

  it('names both sprints where the drawn span crosses one, counted from 1', () => {
    expect(aimOf(ITEM, at({ day: 14 }), SPRINT).meta).toBe('8d · S1–S2')
  })
})

describe('what a release creates in the same lane', () => {
  it('adds an item after the source item, in the source’s own feature', () => {
    const aim = aimOf(ITEM, at(), SPRINT)

    expect(draftOf(ITEM, aim, at(), SPRINT)).toEqual({
      days: 3,
      edge: 'none',
      epicId: 'rail-one',
      featureId: 'feature-one',
      kind: 'item',
      labelId: 'phase-one',
      position: 2,
      sprint: null,
    })
  })

  it('adds it before the source from a start handle, which is the source’s own position', () => {
    const source = { ...ITEM, side: 'start' as const }
    const draft = draftOf(source, aimOf(source, at({ day: 3 }), SPRINT), at({ day: 3 }), SPRINT)

    expect(draft?.position).toBe(1)
    expect(draft?.kind).toBe('item')
  })

  // The dependency follows the end that was grabbed and not the lane: an end means "this comes after
  // that", so the new work waits on the source.
  it('adds a feature after the source feature, with the new one waiting on it', () => {
    const draft = draftOf(FEATURE, aimOf(FEATURE, at(), SPRINT), at(), SPRINT)

    expect(draft?.kind).toBe('feature')
    expect(draft?.position).toBe(2)
    expect(draft?.edge).toBe('new-waits')
    expect(draft?.sprint).toBeNull()
  })

  it('makes the source wait on the new feature from a start handle', () => {
    const source = { ...FEATURE, side: 'start' as const }
    const draft = draftOf(source, aimOf(source, at({ day: 3 }), SPRINT), at({ day: 3 }), SPRINT)

    expect(draft?.edge).toBe('source-waits')
    expect(draft?.position).toBe(1)
  })
})

describe('what a release creates in another lane', () => {
  const other = at({ before: 2, day: 24, epicId: 'rail-two', lane: 1, railName: 'Payments' })

  it('is always a feature, an item belonging to one feature and a feature to one rail', () => {
    const draft = draftOf(ITEM, aimOf(ITEM, other, SPRINT), other, SPRINT)

    expect(draft?.kind).toBe('feature')
    expect(draft?.epicId).toBe('rail-two')
  })

  it('lands among the features that already start before it, which is the order a reader sees', () => {
    expect(draftOf(ITEM, aimOf(ITEM, other, SPRINT), other, SPRINT)?.position).toBe(2)
  })

  // A pin is a floor, so pinning the sprint it was drawn in delays the new feature to where it was
  // drawn and never moves it earlier than the schedule would have put it anyway.
  it('pins the sprint it was drawn in, that being the whole of what a reader said', () => {
    expect(draftOf(ITEM, aimOf(ITEM, other, SPRINT), other, SPRINT)?.sprint).toBe(0)
    const later = at({ day: 44, epicId: 'rail-two', lane: 1 })
    expect(draftOf(ITEM, aimOf(ITEM, later, SPRINT), later, SPRINT)?.sprint).toBe(0)
  })

  it('carries the source’s group across, so the new work is painted like the work it came from', () => {
    expect(draftOf(ITEM, aimOf(ITEM, other, SPRINT), other, SPRINT)?.labelId).toBe('phase-one')
  })

  it('names the source’s **feature** at the other end of the edge, an item having no edges', () => {
    const draft = draftOf(ITEM, aimOf(ITEM, other, SPRINT), other, SPRINT)

    expect(draft?.featureId).toBe('feature-one')
    expect(draft?.edge).toBe('new-waits')
  })

  it('creates nothing at all for a release off the rails', () => {
    const nowhere = at({ epicId: '', lane: null })

    expect(draftOf(ITEM, aimOf(ITEM, nowhere, SPRINT), nowhere, SPRINT)).toBeNull()
  })
})
