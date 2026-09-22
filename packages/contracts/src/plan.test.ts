import { describe, expect, it } from 'vitest'
import {
  EstimateDays,
  IsoDate,
  ItemDocument,
  PlanEpic,
  PlanFeature,
  PlanItem,
  PlanManifest,
  RailColour,
} from './plan.js'
import { LIMITS, MAX_ESTIMATE_DAYS } from './limits.js'

const ulid = (seed: number): string => `01M240ERCRWWCN16Q5AH${String(seed).padStart(6, '0')}`

const ID = ulid(1)
const STAMP = '2026-09-10T00:00:00.000Z'

const epic = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  name: 'Onboarding',
  colour: '#3355ff',
  railOrder: 0,
  binding: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

const feature = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  epicId: ID,
  name: 'Sign-up flow',
  position: 0,
  estimateDays: 3,
  pinSprint: null,
  dependsOn: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

const item = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  featureId: ID,
  name: 'Build the form',
  position: 0,
  estimateDays: 1,
  linkedTaskId: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

const shareLink = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  token: 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7',
  name: 'Client',
  role: 'view',
  scope: { kind: 'plan', planId: ID },
  createdBy: null,
  createdAt: STAMP,
  ...over,
})

const fill = <T,>(count: number, one: () => T): T[] => Array.from({ length: count }, one)

const manifestWith = (over: Record<string, unknown>): unknown => ({
  id: ID,
  name: 'Q1 launch',
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [],
  features: [],
  items: [],
  shareLinks: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

describe('IsoDate', () => {
  it('accepts a bare calendar date', () => {
    expect(IsoDate.safeParse('2026-01-05').success).toBe(true)
  })

  it.each(['2026-1-5', '2026-01-05T00:00:00Z', ''])('rejects %s', (value) => {
    expect(IsoDate.safeParse(value).success).toBe(false)
  })
})

describe('EstimateDays', () => {
  it('accepts zero and the cap', () => {
    expect(EstimateDays.safeParse(0).success).toBe(true)
    expect(EstimateDays.safeParse(MAX_ESTIMATE_DAYS).success).toBe(true)
  })

  it.each([-1, 1.5, MAX_ESTIMATE_DAYS + 1])('rejects %s', (value) => {
    expect(EstimateDays.safeParse(value).success).toBe(false)
  })
})

describe('RailColour', () => {
  it.each(['#ABCDEF', 'red', '#abc'])('rejects %s', (value) => {
    expect(RailColour.safeParse(value).success).toBe(false)
  })

  it('accepts a lowercase hex colour', () => {
    expect(RailColour.safeParse('#3355ff').success).toBe(true)
  })
})

describe('PlanManifest caps, each checked exactly at the boundary', () => {
  it.each([
    ['epics', 'epicsPerPlan', epic],
    ['features', 'featuresPerPlan', feature],
    ['items', 'itemsPerPlan', item],
    ['shareLinks', 'shareLinksPerPlan', shareLink],
  ] as const)('bounds %s at LIMITS.%s', (key, limit, one) => {
    const cap = LIMITS[limit]
    expect(PlanManifest.safeParse(manifestWith({ [key]: fill(cap, one) })).success).toBe(true)
    expect(PlanManifest.safeParse(manifestWith({ [key]: fill(cap + 1, one) })).success).toBe(false)
  })

  it('bounds a feature’s dependsOn at LIMITS.edgesPerPlan', () => {
    const edge = ulid(2)
    const within = feature({ dependsOn: fill(LIMITS.edgesPerPlan, () => edge) })
    const over = feature({ dependsOn: fill(LIMITS.edgesPerPlan + 1, () => edge) })
    expect(PlanFeature.safeParse(within).success).toBe(true)
    expect(PlanFeature.safeParse(over).success).toBe(false)
  })

  it('rejects sprintLengthDays of 0, which would send sprintOf to ±Infinity or NaN', () => {
    expect(PlanManifest.safeParse(manifestWith({ sprintLengthDays: 0 })).success).toBe(false)
    expect(PlanManifest.safeParse(manifestWith({ sprintLengthDays: 1 })).success).toBe(true)
  })
})

describe('fields phase 4 fills in without a migration', () => {
  it('accepts binding as null and as a value', () => {
    expect(PlanEpic.safeParse(epic({ binding: null })).success).toBe(true)
    expect(
      PlanEpic.safeParse(
        epic({ binding: { projectId: ID, role: 'view', sealedToken: 'x' } }),
      ).success,
    ).toBe(true)
  })

  it('accepts linkedTaskId as null and as a value', () => {
    expect(PlanItem.safeParse(item({ linkedTaskId: null })).success).toBe(true)
    expect(PlanItem.safeParse(item({ linkedTaskId: ID })).success).toBe(true)
  })
})

describe('ItemDocument', () => {
  it('parses a description alongside its id and stamps', () => {
    const parsed = ItemDocument.safeParse({ id: ID, description: 'Notes', createdAt: STAMP, updatedAt: STAMP })
    expect(parsed.success).toBe(true)
  })
})
