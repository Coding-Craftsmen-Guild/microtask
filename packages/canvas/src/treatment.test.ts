import { schedule as forwardPass } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { itemsToMarks } from './marks.js'
import type { CanvasPlan } from './plan.js'
import { railLayout } from './rails.js'
import { scaleFor } from './scale.js'
import type { CanvasScheduleWithStatus, Treatment } from './treatment.js'
import { treatmentOf } from './treatment.js'

const E1 = 'epic-1'
const E2 = 'epic-2'

const FT1 = 'feature-1-placed'
const BACKDEP = 'feature-2-depended-on-from-behind'
const NOEST = 'feature-3-unestimated'
const CYC_A = 'feature-4-cycle-a'
const CYC_B = 'feature-5-cycle-b'

const IT_OK = 'item-1-placed'
const IT_NOEST = 'item-2-unestimated'
const IT_CYC = 'item-3-under-a-cycle'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const feature = (
  id: string,
  epicId: string,
  position: number,
  estimateDays: number | null,
): CanvasPlan['features'][number] => ({
  id,
  epicId,
  position,
  estimateDays,
  pinSprint: null,
  dependsOn: [],
})

const PLAN: CanvasPlan = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [
    { id: E1, railOrder: 0, colour: '#ff8833' },
    { id: E2, railOrder: 1, colour: '#3388ff' },
  ],
  features: [
    { ...feature(FT1, E1, 0, 4), dependsOn: [BACKDEP] },
    feature(BACKDEP, E1, 1, 3),
    feature(NOEST, E1, 2, null),
    { ...feature(CYC_A, E2, 0, 2), dependsOn: [CYC_B] },
    { ...feature(CYC_B, E2, 1, 2), dependsOn: [CYC_A] },
  ],
  items: [
    { id: IT_OK, featureId: FT1, position: 0, estimateDays: 2 },
    { id: IT_NOEST, featureId: FT1, position: 1, estimateDays: null },
    { id: IT_CYC, featureId: CYC_A, position: 0, estimateDays: 2 },
  ],
}

const RESULT = forwardPass(PLAN)

const WIRE: CanvasScheduleWithStatus = {
  spans: [...RESULT.days].map(([id, span]) => ({ id, ...span })),
  unscheduled: RESULT.unscheduled,
}

const treatment = (id: string): Treatment => treatmentOf(id, WIRE)

const reasonOf = (id: string): string | undefined =>
  RESULT.unscheduled.find((one) => one.id === id)?.reason

describe('treatmentOf answers §5\'s status channel, which is the one hue never carries', () => {
  it('draws a placed feature solid, because a span is the whole of what phase 2 knows', () => {
    expect(RESULT.days.has(FT1)).toBe(true)
    expect(treatment(FT1)).toBe('solid')
  })

  it('draws a placed item solid too, from the same function and the same kind of id', () => {
    expect(RESULT.days.has(IT_OK)).toBe(true)
    expect(treatment(IT_OK)).toBe('solid')
  })

  it('draws a feature left off for no-estimate hollow, since nothing was sized to fill', () => {
    expect(reasonOf(NOEST)).toBe('no-estimate')
    expect(treatment(NOEST)).toBe('hollow')
  })

  it('draws an unestimated item hollow, though its feature was placed around it', () => {
    expect(reasonOf(IT_NOEST)).toBe('no-estimate')
    expect(RESULT.days.has(FT1)).toBe(true)
    expect(treatment(IT_NOEST)).toBe('hollow')
  })

  it('draws a feature in a dependency cycle contradicted, which is §5\'s dashed red outline', () => {
    expect(reasonOf(CYC_A)).toBe('in-cycle')
    expect(reasonOf(CYC_B)).toBe('in-cycle')
    expect(treatment(CYC_A)).toBe('contradicted')
    expect(treatment(CYC_B)).toBe('contradicted')
  })

  it('draws an estimated item under a cycled feature contradicted, not hollow: it was sized', () => {
    expect(reasonOf(IT_CYC)).toBe('in-cycle')
    expect(treatment(IT_CYC)).toBe('contradicted')
  })

  it('leaves a feature named in ignoredEdges solid, because it did get a span', () => {
    const [edge] = RESULT.ignoredEdges
    expect(edge).toEqual({ featureId: FT1, dependsOnId: BACKDEP })
    expect(RESULT.days.has(FT1)).toBe(true)
    expect(reasonOf(FT1)).toBeUndefined()
    expect(treatment(FT1)).toBe('solid')
  })

  it('never reads ignoredEdges at all: adding one to the wire changes no treatment', () => {
    const before = [FT1, BACKDEP, NOEST, CYC_A].map(treatment)
    const widened = { ...WIRE, ignoredEdges: [{ featureId: NOEST, dependsOnId: FT1 }] }
    expect([FT1, BACKDEP, NOEST, CYC_A].map((id) => treatmentOf(id, widened))).toEqual(before)
  })

  it('never reads spans: a schedule with no spans at all still answers hollow and contradicted', () => {
    const spanless: CanvasScheduleWithStatus = { spans: [], unscheduled: RESULT.unscheduled }
    expect(treatmentOf(NOEST, spanless)).toBe('hollow')
    expect(treatmentOf(CYC_A, spanless)).toBe('contradicted')
  })

  it('reads solid from absence in unscheduled, not from presence in spans', () => {
    const noSpans: CanvasScheduleWithStatus = { spans: [], unscheduled: [] }
    expect(treatmentOf(FT1, noSpans)).toBe('solid')
  })

  it('answers solid for an id the schedule mentions nowhere, so the function is total', () => {
    expect(RESULT.days.has('feature-nobody-authored')).toBe(false)
    expect(reasonOf('feature-nobody-authored')).toBeUndefined()
    expect(treatment('feature-nobody-authored')).toBe('solid')
  })

  it('maps every reason the forward pass can produce, leaving none to fall through to solid', () => {
    const reasons = new Set(RESULT.unscheduled.map((one) => one.reason))
    expect([...reasons].sort()).toEqual(['in-cycle', 'no-estimate'])
    expect(RESULT.unscheduled.map((one) => treatment(one.id))).not.toContain('solid')
  })

  it('answers for a FeatureBar and for an ItemMark from the ids they already carry', () => {
    const bars = railLayout(PLAN, WIRE, SCALE).flatMap((rail) => rail.bars)
    const marks = itemsToMarks(PLAN, WIRE, SCALE)
    expect(bars.map((bar) => bar.id)).toEqual([FT1, BACKDEP])
    expect(marks.map((mark) => mark.id)).toEqual([IT_OK])
    expect(bars.map((bar) => treatment(bar.id))).toEqual(['solid', 'solid'])
    expect(marks.map((mark) => treatment(mark.id))).toEqual(['solid'])
  })

  it('takes a wire schedule that only widens CanvasSchedule with unscheduled', () => {
    expect(Object.keys(WIRE).sort()).toEqual(['spans', 'unscheduled'])
  })
})
