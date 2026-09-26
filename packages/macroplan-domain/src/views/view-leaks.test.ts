import { describe, expect, it } from 'vitest'
import type { Principal, Role } from '@repo/kernel'
import type { EpicBinding } from '../entities/binding.js'
import type { PlanManifest, PlanShareLink } from '../entities/plan.js'
import { epic, feature, item, marked, planManifest, STAMP } from '../testing/index.js'
import { itemView, itemViewFor, planListItem, planView } from './plan-view.js'

const PLAN = marked('PN', 1)
const ELSEWHERE = marked('PN', 2)
const PROJECT = marked('PJ', 1)
const BOUND_PROJECT = marked('PJ', 2)
const RAIL = marked('EP', 1)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)
const LINKED_TASK = marked('TK', 9)

const PLAN_NAME = 'Hollowmere Migration'
const RAIL_NAME = 'Ashcombe hollowmere rail'
const FEATURE_NAME = 'Renew the hollowmere certificate'
const ITEM_NAME = 'Audit the hollowmere invoices'

const WHOLE_PLAN = 'shr_ptarmigan_wholeplanseat'
const READ_ONLY_SEAT = 'shr_ptarmigan_readonlyseat'
const WRITE_SEAT = 'shr_ptarmigan_writeonlyseat'

// The sealed credential the rail's binding holds. It is deliberately not in EVERY_TOKEN: those three
// are shaped per caller, where this one is owed to nobody at all, so it gets its own sweep below.
const SEALED = 'shr_ptarmigan_sealedbindingtoken'

// The binding is bound at manage, not view, so the effective role is the *caller's* role wherever the
// two are compared — a view-role binding would hide the link from everybody and the sweep below could
// not tell a working rule from a blanket refusal.
const BINDING: EpicBinding = { projectId: BOUND_PROJECT, role: 'manage', sealedToken: SEALED }

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
    epics: [epic(RAIL, { name: RAIL_NAME, binding: BINDING })],
    features: [feature(FEATURE, RAIL, { name: FEATURE_NAME })],
    items: [item(ITEM, FEATURE, { name: ITEM_NAME, linkedTaskId: LINKED_TASK })],
    shareLinks: Object.values(LINKS),
  })

interface Caller {
  readonly label: string
  readonly principal: Principal
  readonly tokens: readonly string[]
  // Whether the epic's `binding` block is present at all, which `epic:bind` decides.
  readonly binding: boolean
  // Whether the item still names the task it is linked to, which design §7.3's weaker-of-two decides.
  readonly linkedTask: boolean
}

// The last two callers are shown the linked task id, and that is this file's existing contract rather
// than a hole: `planView` shapes the blocks a policy decides and gates nothing else — the second test
// below asserts the same two callers see every name in the plan — because the route's own
// `authorize()` is what refuses a principal whose scope reaches no plan (ADR 0009). What they are
// refused here is the `binding` block, which is asked of the policy and so answers no for both.
const CALLERS: readonly Caller[] = [
  {
    label: 'an admin, who owns the workspace',
    principal: { kind: 'admin' },
    tokens: EVERY_TOKEN,
    binding: true,
    linkedTask: true,
  },
  {
    label: 'a plan-scoped view holder, which holds no share:read',
    principal: planHolder(LINKS.readOnlySeat),
    tokens: [],
    binding: false,
    linkedTask: false,
  },
  {
    label: 'a plan-scoped write holder, which holds no share:read either',
    principal: planHolder(LINKS.writeSeat),
    tokens: [],
    binding: false,
    linkedTask: true,
  },
  {
    label: 'a plan-scoped manage holder, whose scope is the whole plan',
    principal: planHolder(LINKS.wholePlan),
    tokens: EVERY_TOKEN,
    binding: false,
    linkedTask: true,
  },
  {
    label: 'a manage holder of another plan entirely',
    principal: planHolder(LINKS.wholePlan, ELSEWHERE),
    tokens: [],
    binding: false,
    linkedTask: true,
  },
  {
    label: 'a Microtask project manage holder, whose scope reaches no plan',
    principal: projectHolder(),
    tokens: [],
    binding: false,
    linkedTask: true,
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

    it(`withholds the rail's sealed binding token from ${caller.label}`, () => {
      // Design §7.2 without qualification: the token never leaves the server. So there is no caller
      // this loop could give an allowance to, the admin included.
      expect(JSON.stringify(planView(seed(), caller.principal))).not.toContain(SEALED)
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

describe('the serialised plan view carries the bridge only as far as design §7.3 allows', () => {
  const railOf = (principal: Principal) => planView(seed(), principal).epics[0]
  const itemOf = (principal: Principal) => planView(seed(), principal).items[0]

  for (const caller of CALLERS) {
    it(`shapes the epic's binding block on epic:bind for ${caller.label}`, () => {
      const serialised = JSON.stringify(planView(seed(), caller.principal))
      if (caller.binding) {
        // Exactly two fields, asserted by equality rather than by field: a `toMatchObject` here would
        // pass with `sealedToken` sitting beside them.
        expect(railOf(caller.principal)?.binding).toEqual({ projectId: BOUND_PROJECT, role: 'manage' })
      } else {
        expect(Object.keys(railOf(caller.principal) ?? {})).not.toContain('binding')
        expect(serialised).not.toContain('binding')
        expect(serialised).not.toContain(BOUND_PROJECT)
      }
    })

    it(`names the linked task only at effective write, for ${caller.label}`, () => {
      expect(itemOf(caller.principal)?.linkedTaskId).toBe(caller.linkedTask ? LINKED_TASK : null)
      if (!caller.linkedTask) expect(JSON.stringify(planView(seed(), caller.principal))).not.toContain(LINKED_TASK)
    })
  }

  it('refuses the link as null and never as an absent key, so a view holder cannot tell one exists', () => {
    // §7.3's own words: a view holder is never told "that a link exists". `null` is what an unlinked
    // item carries, so the two are the same sentence; an absent key would be the tell.
    const refused = itemOf(planHolder(LINKS.readOnlySeat))
    expect(Object.keys(refused ?? {})).toContain('linkedTaskId')
    expect(refused).toEqual(item(ITEM, FEATURE, { name: ITEM_NAME }))
  })

  it('is not vacuous: an admin is shown the bound project and the linked task id', () => {
    const serialised = JSON.stringify(planView(seed(), { kind: 'admin' }))
    expect(serialised).toContain(BOUND_PROJECT)
    expect(serialised).toContain(LINKED_TASK)
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

describe('the item view a route answers withholds the link from a reader owed none (§7.3)', () => {
  // The same sweep `planView` gets, run against the other route that answers an item. It is the
  // disagreement that made `itemViewFor` exist: this route is gated on `plan:read` alone, so every
  // reader of the plan reaches it, and it answered `linkedTaskId` unshaped while `planView` withheld
  // the same field from the same reader. The binding is at `manage`, so what decides each answer is the
  // caller's own plan role and not a blanket refusal — a `view` binding would hide the link from
  // everybody and this could not tell a working rule from a broken one.
  for (const caller of CALLERS) {
    it(`${caller.linkedTask ? "carries" : "withholds"} the linked task id for ${caller.label}`, () => {
      const plan = seed()
      const only = plan.items[0]
      if (only === undefined) throw new Error("the fixture holds one item")
      const view = itemViewFor(plan, only, 'A note', caller.principal)
      expect(view.linkedTaskId).toBe(caller.linkedTask ? LINKED_TASK : null)
      expect(JSON.stringify(view).includes(LINKED_TASK)).toBe(caller.linkedTask)
    })
  }

  it(
    'agrees with planView for every caller, which is the whole point of it',
    () => {
      const plan = seed()
      const only = plan.items[0]
      if (only === undefined) throw new Error("the fixture holds one item")
      for (const caller of CALLERS) {
        const inTimeline = planView(plan, caller.principal).items[0]?.linkedTaskId ?? null
        expect(itemViewFor(plan, only, '', caller.principal).linkedTaskId).toBe(inTimeline)
      }
    },
  )

  it(
    'still carries the description, so the shaping did not replace the answer',
    () => {
      const plan = seed()
      const only = plan.items[0]
      if (only === undefined) throw new Error("the fixture holds one item")
      expect(itemViewFor(plan, only, 'A note', { kind: 'admin' }).description).toBe('A note')
    },
  )
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
