import { describe, expect, it } from 'vitest'
import type { Principal, Role } from '@repo/kernel'
import type { PlanManifest, PlanShareLink } from '../entities/plan.js'
import { epic, feature, item, marked, planManifest, STAMP } from '../testing/index.js'
import { itemView, planListItem, planView } from './plan-view.js'

const PLAN = marked('PN', 1)
const ELSEWHERE = marked('PN', 2)
const PROJECT = marked('PJ', 1)
const RAIL = marked('EP', 1)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)

const PLAN_NAME = 'Hollowmere Migration'
const RAIL_NAME = 'Ashcombe hollowmere rail'
const FEATURE_NAME = 'Renew the hollowmere certificate'
const ITEM_NAME = 'Audit the hollowmere invoices'

const WHOLE_PLAN = 'shr_ptarmigan_wholeplanseat'
const READ_ONLY_SEAT = 'shr_ptarmigan_readonlyseat'
const WRITE_SEAT = 'shr_ptarmigan_writeonlyseat'

const EVERY_TOKEN = [WHOLE_PLAN, READ_ONLY_SEAT, WRITE_SEAT] as const
const EVERY_NAME = [PLAN_NAME, RAIL_NAME, FEATURE_NAME, ITEM_NAME] as const

const link = (token: string, role: Role): PlanShareLink => ({
  token,
  name: `Seat ${token}`,
  role,
  createdBy: null,
  createdAt: STAMP,
})

const LINKS = {
  wholePlan: link(WHOLE_PLAN, 'manage'),
  readOnlySeat: link(READ_ONLY_SEAT, 'view'),
  writeSeat: link(WRITE_SEAT, 'write'),
} as const

const planHolder = (each: PlanShareLink, planId = PLAN): Principal => ({
  kind: 'link',
  role: each.role,
  scope: { kind: 'plan', planId },
  token: each.token,
})

const projectHolder = (): Principal => ({
  kind: 'link',
  role: 'manage',
  scope: { kind: 'project', projectId: PROJECT },
  token: 'shr_ptarmigan_microtaskseat',
})

const seed = (): PlanManifest =>
  planManifest(PLAN, {
    name: PLAN_NAME,
    epics: [epic(RAIL, { name: RAIL_NAME })],
    features: [feature(FEATURE, RAIL, { name: FEATURE_NAME })],
    items: [item(ITEM, FEATURE, { name: ITEM_NAME })],
    shareLinks: Object.values(LINKS),
  })

interface Caller {
  readonly label: string
  readonly principal: Principal
  readonly tokens: readonly string[]
}

const CALLERS: readonly Caller[] = [
  {
    label: 'an admin, who owns the workspace',
    principal: { kind: 'admin' },
    tokens: EVERY_TOKEN,
  },
  {
    label: 'a plan-scoped view holder, which holds no share:read',
    principal: planHolder(LINKS.readOnlySeat),
    tokens: [],
  },
  {
    label: 'a plan-scoped write holder, which holds no share:read either',
    principal: planHolder(LINKS.writeSeat),
    tokens: [],
  },
  {
    label: 'a plan-scoped manage holder, whose scope is the whole plan',
    principal: planHolder(LINKS.wholePlan),
    tokens: EVERY_TOKEN,
  },
  {
    label: 'a manage holder of another plan entirely',
    principal: planHolder(LINKS.wholePlan, ELSEWHERE),
    tokens: [],
  },
  {
    label: 'a Microtask project manage holder, whose scope reaches no plan',
    principal: projectHolder(),
    tokens: [],
  },
]

const assertTokens = (serialised: string, allowed: readonly string[]): void => {
  for (const token of EVERY_TOKEN) {
    if (allowed.includes(token)) expect(serialised).toContain(token)
    else expect(serialised).not.toContain(token)
  }
}

describe('the serialised plan view holds exactly the tokens its caller may be told', () => {
  for (const caller of CALLERS) {
    it(`carries only the tokens the policy clears for ${caller.label}`, () => {
      assertTokens(JSON.stringify(planView(seed(), caller.principal)), caller.tokens)
    })

    it(`shapes the block and gates nothing else, so ${caller.label} sees every name`, () => {
      const serialised = JSON.stringify(planView(seed(), caller.principal))
      for (const name of EVERY_NAME) expect(serialised).toContain(name)
    })
  }

  it('leaves the block absent rather than empty for a caller refused it', () => {
    const serialised = JSON.stringify(planView(seed(), planHolder(LINKS.readOnlySeat)))
    expect(serialised).not.toContain('shareLinks')
  })

  it('is not vacuous: an admin is shown every one of the three tokens', () => {
    const serialised = JSON.stringify(planView(seed(), { kind: 'admin' }))
    for (const token of EVERY_TOKEN) expect(serialised).toContain(token)
  })
})

describe('the serialised list row holds no share token for anybody at all (ADR 0033)', () => {
  for (const caller of CALLERS) {
    it(`carries not one of the three tokens for ${caller.label}`, () => {
      assertTokens(JSON.stringify(planListItem(seed(), caller.principal)), [])
    })

    it(`names the plan and none of its contents for ${caller.label}`, () => {
      const serialised = JSON.stringify(planListItem(seed(), caller.principal))
      expect(serialised).toContain(PLAN_NAME)
      expect(serialised).not.toContain(RAIL_NAME)
      expect(serialised).not.toContain(FEATURE_NAME)
      expect(serialised).not.toContain(ITEM_NAME)
    })
  }

  it('is not vacuous: a caller cleared for the links is told how many there are', () => {
    expect(planListItem(seed(), { kind: 'admin' }).shareLinkCount).toBe(3)
    expect(planListItem(seed(), planHolder(LINKS.wholePlan)).shareLinkCount).toBe(3)
  })
})

describe('the serialised item view holds no share token, its own plan included', () => {
  it('carries no token at all, whoever is reading', () => {
    const only = item(ITEM, FEATURE, { name: ITEM_NAME })
    assertTokens(JSON.stringify(itemView(only, 'A note about the hollowmere invoices')), [])
  })

  it('names the item it was asked for, so the assertion above can fail', () => {
    const only = item(ITEM, FEATURE, { name: ITEM_NAME })
    expect(JSON.stringify(itemView(only, 'A note'))).toContain(ITEM_NAME)
  })
})
