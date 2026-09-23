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
  Timezone,
} from './plan.js'
import { PlanShareLink } from './share-link.js'
import { LIMITS, MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from './limits.js'

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

describe('a plan seat carries no scope, a plan having exactly one to carry', () => {
  const PROJECT_SCOPE = { kind: 'project', projectId: ID }
  const TASK_SCOPE = { kind: 'task', projectId: ID, taskId: ulid(2) }
  const PLAN_SCOPE = { kind: 'plan', planId: ID }

  it('accepts the seat as stored, which is a seat with no scope on it at all', () => {
    const parsed = PlanShareLink.safeParse(shareLink())
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(Object.keys(parsed.data ?? {}).sort()).toEqual([
      'createdAt',
      'createdBy',
      'name',
      'role',
      'token',
    ])
  })

  it.each([
    ['project-shaped', PROJECT_SCOPE],
    ['task-shaped', TASK_SCOPE],
    ['plan-shaped', PLAN_SCOPE],
  ])('strips a %s scope key rather than carrying it', (_label, scope) => {
    const parsed = PlanShareLink.safeParse(shareLink({ scope }))
    expect(parsed.success).toBe(true)
    expect(Object.keys(parsed.data ?? {})).toContain('token')
    expect(Object.keys(parsed.data ?? {})).not.toContain('scope')
  })

  it.each([
    ['project-shaped', PROJECT_SCOPE],
    ['task-shaped', TASK_SCOPE],
    ['plan-shaped', PLAN_SCOPE],
  ])('strips a %s scope inside shareLinks too, where a manifest is parsed', (_label, scope) => {
    const parsed = PlanManifest.safeParse(manifestWith({ shareLinks: [shareLink({ scope })] }))
    expect(parsed.error?.issues ?? []).toEqual([])
    const seats = parsed.data?.shareLinks ?? []
    expect(seats).toHaveLength(1)
    expect(Object.keys(seats[0] ?? {})).not.toContain('scope')
  })

  it('accepts a renamed-to-empty seat, UpdateShareLinkPayload permitting one', () => {
    expect(PlanShareLink.safeParse(shareLink({ name: '' })).success).toBe(true)
    const manifest = manifestWith({ shareLinks: [shareLink({ name: '' })] })
    expect(PlanManifest.safeParse(manifest).success).toBe(true)
  })
})

describe('Timezone, the one schema here with a runtime check behind it', () => {
  it.each(['UTC', 'Europe/Belgrade', 'America/Argentina/Buenos_Aires'])(
    'accepts %s, a zone this runtime resolves',
    (value) => {
      expect(Timezone.safeParse(value).success).toBe(true)
    },
  )

  it('refuses a zone Intl cannot resolve, the refusal being the refinement and not a length', () => {
    const bogus = 'Mars/Phobos'
    expect(bogus.length).toBeLessThanOrEqual(64)
    expect(Timezone.safeParse(bogus).success).toBe(false)
  })

  it('refuses it inside a manifest too, so a plan cannot be stored unresolvable', () => {
    expect(PlanManifest.safeParse(manifestWith({ timezone: 'Mars/Phobos' })).success).toBe(false)
  })
})

describe('ItemDocument', () => {
  const doc = (description: string): unknown => ({
    id: ID,
    description,
    createdAt: STAMP,
    updatedAt: STAMP,
  })

  it('parses a description alongside its id and stamps', () => {
    const parsed = ItemDocument.safeParse({ id: ID, description: 'Notes', createdAt: STAMP, updatedAt: STAMP })
    expect(parsed.success).toBe(true)
  })

  it('bounds description at MAX_ITEM_DESCRIPTION_BYTES, checked exactly at the boundary', () => {
    expect(ItemDocument.safeParse(doc('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES))).success).toBe(true)
    expect(ItemDocument.safeParse(doc('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES + 1))).success).toBe(
      false,
    )
  })

  it('counts UTF-16 units and not bytes, which is the backstop its TSDoc says it is', () => {
    /**
     * The real 8 192-byte cap is `cleanDescription` in `@repo/macroplan-domain`, which truncates in
     * UTF-8 bytes without splitting a code point. This `.max()` is the backstop behind it and must
     * not be tightened towards bytes: it would then refuse descriptions the domain had already
     * trimmed to spec, since 8 192 units of astral text is 16 KB encoded and still valid.
     */
    const astral = '\u{1F600}'.repeat(MAX_ITEM_DESCRIPTION_BYTES / 2)
    expect(astral.length).toBe(MAX_ITEM_DESCRIPTION_BYTES)
    expect(Buffer.byteLength(astral, 'utf8')).toBeGreaterThan(MAX_ITEM_DESCRIPTION_BYTES)
    expect(ItemDocument.safeParse(doc(astral)).success).toBe(true)
  })
})
