import { ROLES, type Principal, type Role } from '@repo/kernel'
import { epic, feature, item } from '@repo/macroplan-domain/testing'
import { describe, expect, it } from 'vitest'
import type { BoundProject, TaskFacts } from './bridge-service.js'
import { bridgeView, epicIdOf, namesTheTask, type BridgeStructure } from './bridge-view.js'

const PLAN = '01M240ERCRWWCN16Q5AHP1FZN1'
const OTHER_PLAN = '01M240ERCRWWCN16Q5AHP1FZN2'
const RAIL = '01M240ERCRWWCN16Q5AHP1FZE1'
const OTHER_RAIL = '01M240ERCRWWCN16Q5AHP1FZE2'
const FEATURE = '01M240ERCRWWCN16Q5AHP1FZF1'
const OTHER_FEATURE = '01M240ERCRWWCN16Q5AHP1FZF2'
const ITEM = '01M240ERCRWWCN16Q5AHP1FZM1'
const OTHER_ITEM = '01M240ERCRWWCN16Q5AHP1FZM2'
const TASK = '01M240ERCRWWCN16Q5AHP1FZT1'
const OTHER_TASK = '01M240ERCRWWCN16Q5AHP1FZT2'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'

// The one string every assertion in the gate suite below is about. Distinctive on purpose: a
// not.toContain over a serialised payload is only as good as the improbability of the needle.
const TASK_NAME = 'Rotate the hollowmere signing keys'
const OTHER_TASK_NAME = 'Audit the hollowmere invoices'

const ADMIN: Principal = { kind: 'admin' }

const seat = (role: Role, planId = PLAN): Principal => ({
  kind: 'link',
  role,
  scope: { kind: 'plan', planId },
  token: `shr_ptarmigan_${role}_seat`,
})

const facts = (name: string, done = 1, total = 4): TaskFacts => ({ name, progress: { done, total } })

const boundAt = (role: Role, tasks: readonly (readonly [string, TaskFacts])[]): BoundProject => ({
  state: 'bound',
  projectId: PROJECT,
  role,
  tasks: new Map(tasks),
})

const liveRail = (role: Role): ReadonlyMap<string, BoundProject> =>
  new Map([[RAIL, boundAt(role, [[TASK, facts(TASK_NAME)]])]])

const plan = (overrides: Partial<BridgeStructure> = {}): BridgeStructure => ({
  planId: PLAN,
  epics: [epic(RAIL)],
  features: [feature(FEATURE, RAIL)],
  items: [item(ITEM, FEATURE, { linkedTaskId: TASK })],
  ...overrides,
})

const serialised = (
  principal: Principal,
  bound: ReadonlyMap<string, BoundProject>,
  structure = plan(),
): string => JSON.stringify(bridgeView(structure, bound, principal))

describe('a view holder provably never receives a linked task’s name (spec §9’s gate)', () => {
  it('withholds it from a plan view seat over a rail bound at manage', () => {
    expect(serialised(seat('view'), liveRail('manage'))).not.toContain(TASK_NAME)
  })

  it.each(ROLES)('withholds it from a %s seat over a rail bound at view, the binding being the ceiling', (role) => {
    expect(serialised(seat(role), liveRail('view'))).not.toContain(TASK_NAME)
  })

  it('withholds it from the admin too under a view-role binding, no reader being over the ceiling', () => {
    expect(serialised(ADMIN, liveRail('view'))).not.toContain(TASK_NAME)
  })

  // BoundProject.role arrives already attenuated by the token's live role, so a write seat whose
  // token has since been downgraded to view in Microtask is a rail bound at view here.
  it('withholds it from a write seat whose token has since been downgraded in Microtask', () => {
    expect(serialised(seat('write'), liveRail('view'))).not.toContain(TASK_NAME)
  })

  it('withholds it wherever the rail did not resolve at all', () => {
    const dead = new Map([[RAIL, { state: 'unlinked' } as BoundProject]])
    expect(serialised(seat('manage'), dead)).not.toContain(TASK_NAME)
  })

  it('is not vacuous: a write seat over a write-or-better binding does receive it', () => {
    expect(serialised(seat('write'), liveRail('manage'))).toContain(TASK_NAME)
    expect(serialised(seat('manage'), liveRail('manage'))).toContain(TASK_NAME)
    expect(serialised(ADMIN, liveRail('manage'))).toContain(TASK_NAME)
  })

  it('withholds the name and still hands over the count, which is what §7.3 promises a view holder', () => {
    const view = bridgeView(plan(), liveRail('manage'), seat('view'))
    expect(view.items).toEqual([{ itemId: ITEM, progress: { done: 1, total: 4 } }])
    expect(Object.keys(view.items[0] ?? {})).not.toContain('taskName')
  })

  it('carries no task id either, an opaque id still being evidence a link exists', () => {
    expect(serialised(seat('view'), liveRail('manage'))).not.toContain(TASK)
  })
})

describe('the name is decided per rail, because a plan can hold rails bound differently', () => {
  const twoRails = (): BridgeStructure =>
    plan({
      epics: [epic(RAIL), epic(OTHER_RAIL, { railOrder: 1 })],
      features: [feature(FEATURE, RAIL), feature(OTHER_FEATURE, OTHER_RAIL)],
      items: [
        item(ITEM, FEATURE, { linkedTaskId: TASK }),
        item(OTHER_ITEM, OTHER_FEATURE, { linkedTaskId: OTHER_TASK }),
      ],
    })

  const mixed = (): ReadonlyMap<string, BoundProject> =>
    new Map([
      [RAIL, boundAt('manage', [[TASK, facts(TASK_NAME)]])],
      [OTHER_RAIL, boundAt('view', [[OTHER_TASK, facts(OTHER_TASK_NAME)]])],
    ])

  it('names the task on the manage-bound rail and not on the view-bound one, for one reader', () => {
    const view = bridgeView(twoRails(), mixed(), seat('manage'))
    expect(view.items.find((row) => row.itemId === ITEM)?.taskName).toBe(TASK_NAME)
    expect(view.items.find((row) => row.itemId === OTHER_ITEM)?.taskName).toBeUndefined()
  })

  it('leaks neither name to a view seat, whichever rail it sits under', () => {
    const text = JSON.stringify(bridgeView(twoRails(), mixed(), seat('view')))
    expect(text).not.toContain(TASK_NAME)
    expect(text).not.toContain(OTHER_TASK_NAME)
  })

  it('still counts both, so the sweep above is about the name and not about the row', () => {
    const view = bridgeView(twoRails(), mixed(), seat('view'))
    expect(view.items.map((row) => row.itemId).sort()).toEqual([ITEM, OTHER_ITEM].sort())
  })
})

describe('which items get a row at all', () => {
  const rowsFor = (structure: BridgeStructure, bound = liveRail('manage')): readonly string[] =>
    bridgeView(structure, bound, ADMIN).items.map((row) => row.itemId)

  it('gives an unlinked item no row, there being no counted number to report', () => {
    expect(rowsFor(plan({ items: [item(ITEM, FEATURE)] }))).toEqual([])
  })

  it('gives an item under an unresolved rail no row', () => {
    const dead = new Map([[RAIL, { state: 'unlinked' } as BoundProject]])
    expect(rowsFor(plan(), dead)).toEqual([])
  })

  // §7.2 fixes what a number may be: "an unlinked item has a manual status only — not a manual
  // percentage — so a number on screen is always a counted number". A task deleted in Microtask
  // leaves the link pointing at nothing, and a zeroed row would be an invented count.
  it('gives an item whose task the bound project no longer holds no row, rather than a zeroed one', () => {
    const emptied = new Map([[RAIL, boundAt('manage', [])]])
    expect(rowsFor(plan(), emptied)).toEqual([])
  })

  it('gives an item whose feature the plan does not hold no row, a broken chain proving nothing', () => {
    expect(rowsFor(plan({ features: [] }))).toEqual([])
  })

  it('gives an item whose rail is absent from the answer no row', () => {
    expect(rowsFor(plan(), new Map())).toEqual([])
  })

  it('is not vacuous: a linked item under a live rail naming a held task does get one', () => {
    expect(rowsFor(plan())).toEqual([ITEM])
  })

  it('keeps the plan’s own item order, so two readers of one plan agree row for row', () => {
    const many = plan({
      features: [feature(FEATURE, RAIL)],
      items: [
        item(OTHER_ITEM, FEATURE, { linkedTaskId: OTHER_TASK, position: 0 }),
        item(ITEM, FEATURE, { linkedTaskId: TASK, position: 1 }),
      ],
    })
    const bound = new Map([
      [RAIL, boundAt('manage', [[TASK, facts(TASK_NAME)], [OTHER_TASK, facts(OTHER_TASK_NAME)]])],
    ])
    expect(rowsFor(many, bound)).toEqual([OTHER_ITEM, ITEM])
  })
})

describe('the epic block is admin-only, and absent rather than empty when refused', () => {
  it('carries a row per rail for an admin, bound or not', () => {
    const structure = plan({ epics: [epic(RAIL), epic(OTHER_RAIL, { railOrder: 1 })] })
    expect(bridgeView(structure, liveRail('manage'), ADMIN).epics).toEqual([
      { epicId: RAIL, state: 'bound', binding: { projectId: PROJECT, role: 'manage' } },
      { epicId: OTHER_RAIL, state: 'unlinked' },
    ])
  })

  it.each(ROLES)('leaves the block absent for a %s seat, epic:bind being admin-only', (role) => {
    const view = bridgeView(plan(), liveRail('manage'), seat(role))
    expect(view.epics).toBeUndefined()
    expect(Object.keys(view)).toEqual(['items'])
  })

  it('reports a rail whose token died as unlinked, with no binding block on the row', () => {
    const dead = new Map([[RAIL, { state: 'unlinked' } as BoundProject]])
    expect(bridgeView(plan(), dead, ADMIN).epics).toEqual([{ epicId: RAIL, state: 'unlinked' }])
  })

  // The stored role is already in planView's own admin-only binding block. What only the bridge
  // knows is what that role is worth today, so this row carries the attenuated one.
  it('carries the attenuated role and not the stored one, that being what only the bridge knows', () => {
    const downgraded = new Map([[RAIL, boundAt('view', [[TASK, facts(TASK_NAME)]])]])
    expect(bridgeView(plan(), downgraded, ADMIN).epics?.[0]?.binding?.role).toBe('view')
  })

  it('carries an empty block for an admin reading a plan with no rails, rather than dropping it', () => {
    const view = bridgeView(plan({ epics: [], features: [], items: [] }), new Map(), ADMIN)
    expect(view.epics).toEqual([])
    expect(view.items).toEqual([])
  })

  it('never carries a sealed token, no row of either block having a field for one', () => {
    const text = serialised(ADMIN, liveRail('manage'))
    expect(text).not.toContain('sealed')
    expect(text).not.toContain('Token')
  })
})

describe('the answers are for the scope handed in, never for a role alone (ADR 0038)', () => {
  it('refuses the epic block to a manage seat rooted in another plan', () => {
    expect(bridgeView(plan(), liveRail('manage'), seat('manage', OTHER_PLAN)).epics).toBeUndefined()
  })

  it('refuses the epic block to a Microtask project holder, whose scope reaches no plan', () => {
    const holder: Principal = {
      kind: 'link',
      role: 'manage',
      scope: { kind: 'project', projectId: PROJECT },
      token: 'shr_ptarmigan_microtaskseat',
    }
    expect(bridgeView(plan(), liveRail('manage'), holder).epics).toBeUndefined()
  })
})

describe('namesTheTask reads the boundary off the kernel’s own role order', () => {
  it('answers no for view and yes for write and manage', () => {
    expect(namesTheTask('view')).toBe(false)
    expect(namesTheTask('write')).toBe(true)
    expect(namesTheTask('manage')).toBe(true)
  })

  it('agrees with ROLES rather than with a hand-written comparison to view', () => {
    const owed = ROLES.filter((role) => namesTheTask(role))
    expect(owed).toEqual(ROLES.slice(ROLES.indexOf('write')))
  })
})

describe('epicIdOf walks the two hops, and says so when it cannot', () => {
  it('answers the rail an item sits under', () => {
    expect(epicIdOf(plan(), item(ITEM, FEATURE))).toBe(RAIL)
  })

  it('answers undefined when the feature is missing', () => {
    expect(epicIdOf(plan({ features: [] }), item(ITEM, FEATURE))).toBeUndefined()
  })

  it('answers undefined when the feature names a rail the plan does not hold', () => {
    const orphaned = plan({ features: [feature(FEATURE, OTHER_RAIL)] })
    expect(epicIdOf(orphaned, item(ITEM, FEATURE))).toBeUndefined()
  })
})
