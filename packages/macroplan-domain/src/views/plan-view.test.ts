import { describe, expect, it } from 'vitest'
import type { Principal, Role } from '@repo/kernel'
import { ROLES, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanManifest } from '../entities/plan.js'
import { EpicService } from '../services/epic-service.js'
import { FeatureService } from '../services/feature-service.js'
import { ItemService } from '../services/item-service.js'
import type { PlanRef } from '../services/refs.js'
import {
  MemoryPlanStore,
  epic,
  feature,
  fixedClock,
  item,
  marked,
  planManifest,
  sequentialIds,
  STAMP,
} from '../testing/index.js'
import { declaredBindingRole, planRoleOf, visibleTaskLink } from './bridge-view.js'
import { itemView, planListItem, planSchedule, planView } from './plan-view.js'

const NOW = '2026-09-23T12:00:00.000Z'
const PLAN = marked('PN', 1)
const ALPHA = marked('EP', 1)
const BETA = marked('EP', 2)
const GAMMA = marked('EP', 3)
const F1 = marked('FT', 1)
const F2 = marked('FT', 2)
const F3 = marked('FT', 3)
const I1 = marked('TM', 1)
const I2 = marked('TM', 2)
const TOKEN = 'shr_ptarmigan_planseatone'

const ADMIN: Principal = { kind: 'admin' }
const at: PlanRef = { product: 'macroplan', planId: PLAN }

const oneRail = (): PlanManifest =>
  planManifest(PLAN, {
    epics: [epic(ALPHA)],
    features: [
      feature(F1, ALPHA, { position: 0, estimateDays: 4 }),
      feature(F2, ALPHA, { position: 1, estimateDays: 3 }),
      feature(F3, ALPHA, { position: 2, estimateDays: 5 }),
    ],
  })

const threeRails = (): PlanManifest =>
  planManifest(PLAN, {
    epics: [
      epic(ALPHA, { railOrder: 0 }),
      epic(BETA, { railOrder: 1 }),
      epic(GAMMA, { railOrder: 2 }),
    ],
    features: [
      feature(F3, GAMMA, { position: 0, estimateDays: 10 }),
      feature(F1, ALPHA, { position: 0, estimateDays: 10 }),
      feature(F2, BETA, { position: 0, estimateDays: 10 }),
    ],
  })

const spanOf = (manifest: PlanManifest, id: string): unknown =>
  planSchedule(manifest).spans.find((each) => each.id === id)

const span = (startDay: number, endDay: number): unknown => ({ id: expect.any(String), startDay, endDay })

const build = () => {
  const store = new MemoryPlanStore()
  const ctx = {
    store,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  }
  return {
    store,
    epics: new EpicService(ctx),
    features: new FeatureService(ctx),
    items: new ItemService(ctx),
  }
}

describe('planView carries the schedule the forward pass already pinned', () => {
  it('lays one rail head to tail, exactly as the engine example does', () => {
    const view = planView(oneRail(), ADMIN)
    expect(view.schedule.spans).toEqual([
      { id: F1, startDay: 0, endDay: 4 },
      { id: F2, startDay: 4, endDay: 7 },
      { id: F3, startDay: 7, endDay: 12 },
    ])
  })

  it('starts three rails together, so the plan is ten days long and not thirty', () => {
    const view = planView(threeRails(), ADMIN)
    expect(view.schedule.spans.map((each) => each.startDay)).toEqual([0, 0, 0])
    expect(view.schedule.spans.map((each) => each.endDay)).toEqual([10, 10, 10])
  })

  it('breaks a tie on the starting day by id, so the order is total', () => {
    const view = planView(threeRails(), ADMIN)
    expect(view.schedule.spans.map((each) => each.id)).toEqual([F1, F2, F3])
  })

  it('sorts by the starting day first, whatever the ids are', () => {
    const view = planView(oneRail(), ADMIN)
    expect(view.schedule.spans.map((each) => each.startDay)).toEqual([0, 4, 7])
  })

  it('carries item ids and feature ids in the one span list', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [feature(F1, ALPHA, { position: 0, estimateDays: 9 })],
      items: [
        item(I1, F1, { position: 0, estimateDays: 2 }),
        item(I2, F1, { position: 1, estimateDays: 4 }),
      ],
    })
    expect(planView(manifest, ADMIN).schedule.spans).toEqual([
      { id: F1, startDay: 0, endDay: 6 },
      { id: I1, startDay: 0, endDay: 2 },
      { id: I2, startDay: 2, endDay: 6 },
    ])
  })

  it('answers an empty schedule for a plan with no epics, and throws nothing', () => {
    const view = planView(planManifest(PLAN), ADMIN)
    expect(view.schedule).toEqual({ spans: [], cycles: [], unscheduled: [], ignoredEdges: [] })
  })

  it('sorts the unscheduled by id', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [
        feature(F3, ALPHA, { position: 0, estimateDays: null }),
        feature(F1, ALPHA, { position: 1, estimateDays: null }),
        feature(F2, ALPHA, { position: 2, estimateDays: null }),
      ],
    })
    expect(planView(manifest, ADMIN).schedule.unscheduled).toEqual([
      { id: F1, reason: 'no-estimate' },
      { id: F2, reason: 'no-estimate' },
      { id: F3, reason: 'no-estimate' },
    ])
  })

  it('reports a cycle as findCycles gave it, ids ascending', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [
        feature(F2, ALPHA, { position: 0, dependsOn: [F1] }),
        feature(F1, ALPHA, { position: 1, dependsOn: [F2] }),
      ],
    })
    const view = planView(manifest, ADMIN)
    expect(view.schedule.cycles).toEqual([{ featureIds: [F1, F2] }])
    expect(view.schedule.spans).toEqual([])
  })

  it('reports an edge the pass had to drop to keep rail order', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [
        feature(F1, ALPHA, { position: 0, estimateDays: 4, dependsOn: [F2] }),
        feature(F2, ALPHA, { position: 1, estimateDays: 3 }),
      ],
    })
    expect(planView(manifest, ADMIN).schedule.ignoredEdges).toEqual([
      { featureId: F1, dependsOnId: F2 },
    ])
  })

  it('places a milestone of zero days, rather than leaving it off the axis', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [feature(F1, ALPHA, { position: 0, estimateDays: 0 })],
    })
    expect(spanOf(manifest, F1)).toEqual(span(0, 0))
    expect(planView(manifest, ADMIN).schedule.unscheduled).toEqual([])
  })

  it('derives the schedule and stores nothing, so the manifest it was given is untouched', () => {
    const manifest = oneRail()
    planView(manifest, ADMIN)
    expect(manifest).toEqual(oneRail())
    expect('schedule' in manifest).toBe(false)
  })
})

describe('planView carries the plan itself beside the schedule', () => {
  it('carries the settings, the contents and the stamps', () => {
    const view = planView(oneRail(), ADMIN)
    expect(view).toMatchObject({
      id: PLAN,
      name: 'Launch',
      startDate: '2026-01-05',
      sprintLengthDays: 10,
      timezone: 'UTC',
      createdAt: STAMP,
      updatedAt: STAMP,
    })
    expect(view.features).toHaveLength(3)
  })

  it('carries the epics and items as the manifest holds them', () => {
    const view = planView(oneRail(), ADMIN)
    expect(view.epics).toEqual(oneRail().epics)
    expect(view.items).toEqual([])
  })
})

describe('planListItem describes a plan without its contents', () => {
  it('carries the three counts', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA), epic(BETA, { railOrder: 1 })],
      features: [feature(F1, ALPHA), feature(F2, ALPHA, { position: 1 }), feature(F3, BETA)],
      items: [item(I1, F1)],
    })
    expect(planListItem(manifest, ADMIN)).toMatchObject({
      epicCount: 2,
      featureCount: 3,
      itemCount: 1,
    })
  })

  it('carries no collection at all, at any bound', () => {
    const row = planListItem(oneRail(), ADMIN)
    expect(Object.keys(row)).not.toContain('epics')
    expect(Object.keys(row)).not.toContain('features')
    expect(Object.keys(row)).not.toContain('items')
    expect(Object.keys(row)).not.toContain('shareLinks')
  })

  it('carries no schedule, since a list renders no bars', () => {
    expect(Object.keys(planListItem(oneRail(), ADMIN))).not.toContain('schedule')
  })

  it('carries the settings and the stamps a row shows', () => {
    expect(planListItem(oneRail(), ADMIN)).toMatchObject({
      id: PLAN,
      name: 'Launch',
      startDate: '2026-01-05',
      sprintLengthDays: 10,
      timezone: 'UTC',
      createdAt: STAMP,
      updatedAt: STAMP,
    })
  })

  it('counts zero for an empty plan rather than leaving the counts off', () => {
    expect(planListItem(planManifest(PLAN), ADMIN)).toMatchObject({
      epicCount: 0,
      featureCount: 0,
      itemCount: 0,
    })
  })
})

describe('itemView adds the description the item file holds', () => {
  it('carries the item whole beside its description', () => {
    const only = item(I1, F1, { estimateDays: 2 })
    expect(itemView(only, 'Wire the form')).toEqual({ ...only, description: 'Wire the form' })
  })

  it('carries an empty description as an empty string, which is what a missing file answers', () => {
    expect(itemView(item(I1, F1), '').description).toBe('')
  })
})

describe('a stored manifest never carries a schedule, whatever was written last', () => {
  const storedAfter = async (
    write: (built: ReturnType<typeof build>) => Promise<unknown>,
  ): Promise<PlanManifest> => {
    const built = build()
    await built.store.saveManifest('macroplan', oneRail())
    await write(built)
    const stored = await built.store.readManifest('macroplan', PLAN)
    if (stored === null) throw new Error('no manifest')
    return stored
  }

  it('carries none after an epic is added', async () => {
    const stored = await storedAfter(({ epics }) => epics.add(at, { name: 'Growth' }))
    expect('schedule' in stored).toBe(false)
  })

  it('carries none after a feature is placed', async () => {
    const stored = await storedAfter(({ features }) =>
      features.place(at, F1, { epicId: ALPHA, position: 2 }),
    )
    expect('schedule' in stored).toBe(false)
  })

  it('carries none after dependencies are set', async () => {
    const stored = await storedAfter(({ features }) => features.setDependencies(at, F3, [F1]))
    expect('schedule' in stored).toBe(false)
  })

  it('carries none after an item is added and described', async () => {
    const stored = await storedAfter(async ({ items, store }) => {
      const next = await items.add(at, { featureId: F1, name: 'One' })
      const added = next.items[0]
      if (added === undefined) throw new Error('no item')
      await items.writeDescription({ ...at, itemId: added.id }, 'A note')
      return store
    })
    expect('schedule' in stored).toBe(false)
  })

  it('carries none after an epic is removed', async () => {
    const stored = await storedAfter(({ epics }) => epics.remove(at, ALPHA))
    expect('schedule' in stored).toBe(false)
  })

  it('is not vacuous: the view built from that same manifest does carry one', async () => {
    const stored = await storedAfter(({ epics }) => epics.add(at, { name: 'Growth' }))
    expect('schedule' in planView(stored, ADMIN)).toBe(true)
  })
})

describe('planView and planListItem gate the share links on share:read', () => {
  const shared = (): PlanManifest =>
    planManifest(PLAN, {
      shareLinks: [
        { token: TOKEN, name: 'Jane at ACME', role: 'view', createdBy: null, createdAt: STAMP },
      ],
    })

  const holder = (role: 'view' | 'write' | 'manage'): Principal => ({
    kind: 'link',
    role,
    scope: { kind: 'plan', planId: PLAN },
    token: TOKEN,
  })

  it('carries the block for an admin', () => {
    expect(planView(shared(), ADMIN).shareLinks).toHaveLength(1)
  })

  it('carries the block for a manage holder, which holds share:read', () => {
    expect(planView(shared(), holder('manage')).shareLinks).toHaveLength(1)
  })

  it('leaves the block absent for a view holder, and absent is not empty', () => {
    const view = planView(shared(), holder('view'))
    expect(view.shareLinks).toBeUndefined()
    expect(Object.keys(view)).not.toContain('shareLinks')
  })

  it('leaves the block absent for a write holder too', () => {
    expect(planView(shared(), holder('write')).shareLinks).toBeUndefined()
  })

  it('counts the links for a caller cleared for them', () => {
    expect(planListItem(shared(), ADMIN).shareLinkCount).toBe(1)
    expect(planListItem(shared(), holder('manage')).shareLinkCount).toBe(1)
  })

  it('tells a refused caller nothing, not even a zero', () => {
    expect(planListItem(shared(), holder('view')).shareLinkCount).toBeUndefined()
    expect(Object.keys(planListItem(shared(), holder('view')))).not.toContain('shareLinkCount')
  })

  it('says zero rather than nothing when a cleared caller has no links to see', () => {
    expect(planListItem(planManifest(PLAN), ADMIN).shareLinkCount).toBe(0)
  })
})

describe('planRoleOf answers the plan role design §7.3 takes the weaker half of', () => {
  const seat = (role: Role): Principal => ({
    kind: 'link',
    role,
    scope: { kind: 'plan', planId: PLAN },
    token: TOKEN,
  })

  it('answers manage for an admin, which is its floor and its ceiling at once', () => {
    // An admin stores no role. `can()` answers yes for it on every action and every target, so
    // manage is the only answer that is neither an under- nor an over-statement — and answering
    // view instead would make the admin the weakest reader of the bridge, silently.
    expect(planRoleOf(ADMIN)).toBe('manage')
  })

  it('answers a link holder its own role, for every role the kernel declares', () => {
    for (const role of ROLES) expect(planRoleOf(seat(role))).toBe(role)
  })

  it('is not vacuous: the three roles it was asked about are three different answers', () => {
    expect(ROLES.map((role) => planRoleOf(seat(role)))).toEqual(['view', 'write', 'manage'])
  })
})

describe('planView shapes the bridge on the weaker of the two roles (design §7.3)', () => {
  const BOUND = marked('PJ', 1)
  const TASK = marked('TK', 1)
  const SEALED = 'shr_ptarmigan_sealedbindingtoken'

  const seat = (role: Role): Principal => ({
    kind: 'link',
    role,
    scope: { kind: 'plan', planId: PLAN },
    token: TOKEN,
  })

  const bound = (role: 'view' | 'manage'): PlanManifest =>
    planManifest(PLAN, {
      epics: [epic(ALPHA, { binding: { projectId: BOUND, role, sealedToken: SEALED } })],
      features: [feature(F1, ALPHA)],
      items: [item(I1, F1, { linkedTaskId: TASK })],
    })

  const unbound = (): PlanManifest =>
    planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [feature(F1, ALPHA)],
      items: [item(I1, F1, { linkedTaskId: TASK })],
    })

  const railOf = (manifest: PlanManifest, principal: Principal) =>
    planView(manifest, principal).epics[0]

  const linkOf = (manifest: PlanManifest, principal: Principal) =>
    planView(manifest, principal).items[0]?.linkedTaskId

  it('carries the binding to an admin as two fields, the sealed token dropped', () => {
    expect(railOf(bound('manage'), ADMIN)?.binding).toEqual({ projectId: BOUND, role: 'manage' })
  })

  it('carries binding: null to an admin reading an unbound rail, which is a fact about the rail', () => {
    // null here is not a refusal: an admin is never refused, so it can only mean "bound to nothing".
    expect(railOf(unbound(), ADMIN)?.binding).toBeNull()
  })

  it('leaves the binding block absent for a seat holder of any role, since epic:bind is admin-only', () => {
    for (const role of ROLES) {
      expect(Object.keys(railOf(bound('manage'), seat(role)) ?? {})).not.toContain('binding')
    }
  })

  it('hides the link from a plan manage holder under a view-role binding, the binding being the ceiling', () => {
    expect(linkOf(bound('view'), seat('manage'))).toBeNull()
  })

  it('shows the link to a plan write holder under a manage-role binding', () => {
    expect(linkOf(bound('manage'), seat('write'))).toBe(TASK)
  })

  it('hides the link from a plan view holder under a manage-role binding', () => {
    expect(linkOf(bound('manage'), seat('view'))).toBeNull()
  })

  it('keeps the link under an unbound rail for every caller, since no binding exists to attenuate', () => {
    for (const role of ROLES) expect(linkOf(unbound(), seat(role))).toBe(TASK)
    expect(linkOf(unbound(), ADMIN)).toBe(TASK)
  })

  it('refuses the link to the admin too under a view-role binding, the binding being the ceiling', () => {
    // effectiveBridgeRole(manage, view) is view, so even the admin is refused the id here: the
    // binding's own role is the ceiling and §7.3 gives nobody a way over it.
    expect(linkOf(bound('view'), ADMIN)).toBeNull()
  })
})

describe('declaredBindingRole reads the stored role, and says which kind of nothing it found', () => {
  const bound = planManifest(PLAN, {
    epics: [epic(ALPHA, { binding: { projectId: marked('PJ', 1), role: 'view', sealedToken: 'x' } })],
    features: [feature(F1, ALPHA)],
    items: [item(I1, F1, { linkedTaskId: marked('TK', 1) })],
  })

  const orphan = item(I2, F2, { linkedTaskId: marked('TK', 2) })

  it('answers the declared role for an item under a bound rail', () => {
    const only = bound.items[0]
    expect(only && declaredBindingRole(bound, only)).toBe('view')
  })

  it('answers null for an item under a rail bound to nothing, which is proof there is no bridge', () => {
    const manifest = planManifest(PLAN, {
      epics: [epic(ALPHA)],
      features: [feature(F1, ALPHA)],
      items: [item(I1, F1)],
    })
    const only = manifest.items[0]
    expect(only && declaredBindingRole(manifest, only)).toBeNull()
  })

  it('answers undefined when the item names a feature the plan does not hold', () => {
    expect(declaredBindingRole(bound, orphan)).toBeUndefined()
  })

  it('refuses the link for that unresolvable item at every role, rather than guessing it is unbound', () => {
    // A corrupt chain proves nothing about what is bound, so it fails closed. An unbound rail is
    // the opposite case and keeps its id, which the sweep above pins.
    for (const role of ROLES) expect(visibleTaskLink(bound, orphan, role)).toBeNull()
  })
})
