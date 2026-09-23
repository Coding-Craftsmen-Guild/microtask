import { itemsByFeature, schedule as forwardPass } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import type { CanvasPlan, CanvasSchedule } from './plan.js'
import type { ItemMark } from './marks.js'
import { itemsToMarks } from './marks.js'
import { scaleFor, dayToX, widthOfDays } from './scale.js'

const EPIC = 'epic-1'
const F1 = 'feature-1'
const NO_SUCH_FEATURE = 'feature-nobody-declared'

const IT1 = 'item-1'
const IT2 = 'item-2'
const ORPHAN_ITEM = 'item-orphan-no-feature'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const PLAN: CanvasPlan = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [{ id: EPIC, railOrder: 0, colour: '#ff8833' }],
  features: [
    { id: F1, epicId: EPIC, position: 0, estimateDays: null, pinSprint: null, dependsOn: [] },
  ],
  items: [
    { id: IT1, featureId: F1, position: 1, estimateDays: 2 },
    { id: IT2, featureId: F1, position: 0, estimateDays: 3 },
    { id: ORPHAN_ITEM, featureId: NO_SUCH_FEATURE, position: 0, estimateDays: 1 },
  ],
}

const wireOf = (plan: CanvasPlan): CanvasSchedule => ({
  spans: [...forwardPass(plan).days].map(([id, span]) => ({
    id,
    startDay: span.startDay,
    endDay: span.endDay,
  })),
})

const WIRE = wireOf(PLAN)

const marks = (): readonly ItemMark[] => itemsToMarks(PLAN, WIRE, SCALE)

describe('itemsToMarks turns a plan and its wire schedule into one mark per placed item', () => {
  it('marks only ids that are items, since spans carries features and items in one array', () => {
    expect(WIRE.spans.map((span) => span.id)).toContain(F1)
    expect(marks().map((mark) => mark.id)).toEqual([IT2, IT1])
    expect(marks().map((mark) => mark.id)).not.toContain(F1)
  })

  it('ignores an item whose featureId names no feature, which the pass places in neither channel', () => {
    const result = forwardPass(PLAN)
    expect([...result.days.keys()]).not.toContain(ORPHAN_ITEM)
    expect(result.unscheduled.map((one) => one.id)).not.toContain(ORPHAN_ITEM)
    expect(marks().map((mark) => mark.id)).not.toContain(ORPHAN_ITEM)
  })

  it('keeps items in (position, id) order within their feature, matching itemsByFeature', () => {
    const expected = itemsByFeature(PLAN).get(F1)?.map((item) => item.id)
    expect(marks().map((mark) => mark.id)).toEqual(expected)
  })

  it('carries the days a mark covers beside its geometry, so a hover need not re-consult the spans', () => {
    const mark = marks().find((one) => one.id === IT2)
    expect(mark?.startDay).toBe(0)
    expect(mark?.endDay).toBe(3)
    expect(mark?.width).toBe(widthOfDays(3, SCALE))
    expect(mark?.x).toBe(dayToX(0, SCALE))
  })

  it('places a later item after the one before it, at that later start day', () => {
    const mark = marks().find((one) => one.id === IT1)
    expect(mark?.startDay).toBe(3)
    expect(mark?.endDay).toBe(5)
    expect(mark?.x).toBe(dayToX(3, SCALE))
  })

  it('draws a zero-day item at zero width, since a zero estimate is a placed milestone, not a gap', () => {
    const zeroDayPlan: CanvasPlan = {
      ...PLAN,
      items: [{ id: IT1, featureId: F1, position: 0, estimateDays: 0 }],
    }
    const wire = wireOf(zeroDayPlan)
    const mark = itemsToMarks(zeroDayPlan, wire, SCALE).find((one) => one.id === IT1)
    expect(mark?.startDay).toBe(mark?.endDay)
    expect(mark?.width).toBe(0)
  })

  it('carries the featureId a mark flows under, so a caller can nest it without a second pass', () => {
    expect(marks().every((mark) => mark.featureId === F1)).toBe(true)
  })

  it('mutates neither argument, so two passes of one plan agree', () => {
    const before = JSON.stringify(PLAN)
    expect(itemsToMarks(PLAN, WIRE, SCALE)).toEqual(itemsToMarks(PLAN, WIRE, SCALE))
    expect(JSON.stringify(PLAN)).toBe(before)
  })

  it('answers no marks for a plan with no items', () => {
    const empty: CanvasPlan = { ...PLAN, items: [] }
    expect(itemsToMarks(empty, wireOf(empty), SCALE)).toEqual([])
  })
})
