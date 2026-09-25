import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  WRITE_SEAT_TOKEN,
} from './testing/plan-fixture'

// Every export of `actions/seat-writes.ts`, each replaced by a recorder that says which of the
// twenty-three was reached and with what. Names rather than `vi.fn()`s per export, because what this
// file has to prove is *which* action a member is wired to, and a recorder that carries its own
// name proves it in one assertion.
const SEAT_BRIDGE = [
  'seatBindEpic',
  'seatUnbindEpic',
  'seatLinkItem',
  'seatUnlinkItem',
  'seatCreateTask',
]

const SEAT_WRITES = [
  'seatCreateEpic',
  'seatRenameEpic',
  'seatRecolourEpic',
  'seatReorderEpic',
  'seatRemoveEpic',
  'seatCreateFeature',
  'seatRenameFeature',
  'seatEstimateFeature',
  'seatPinFeature',
  'seatPlaceFeature',
  'seatSetDependencies',
  'seatRemoveFeature',
  'seatCreateItem',
  'seatRenameItem',
  'seatEstimateItem',
  'seatDescribeItem',
  'seatPlaceItem',
  'seatRemoveItem',
]

const calls: unknown[][] = []

const recorder =
  (name: string) =>
  (...args: unknown[]): Promise<unknown> => {
    calls.push([name, ...args])
    return Promise.resolve({ ok: true, value: name })
  }

vi.mock('../../actions/seat-writes', () =>
  Object.fromEntries(SEAT_WRITES.map((name) => [name, recorder(name)])),
)

// The five bridge writes moved to their own module when `seat-writes.ts` hit the line cap. Mocked
// separately rather than folded in, so a member that moved back would fail this file rather than resolve
// against whichever mock happened to still name it.
vi.mock('../../actions/seat-bridge', () =>
  Object.fromEntries(SEAT_BRIDGE.map((name) => [name, recorder(name)])),
)

const { seatPlanActions } = await import('./seat-actions')

const TOKEN = WRITE_SEAT_TOKEN
const NAME = 'Auth rewrite II'
const COLOUR = '#ef4444'
const DESCRIPTION = 'Rotate the signing keys first.'
const TOKEN_PASTED = 'shr_pasted_from_microtask'
const TASK_1 = '01M240ERCRWWCN16Q5AHP1FZT1'

const actions = seatPlanActions(TOKEN)

const sorted = (names: readonly string[]): readonly string[] => [...names].sort()

interface Wiring {
  readonly key: string
  readonly run: () => Promise<unknown>
  readonly sends: readonly unknown[]
}

// One row per member of `PlanEditActions`: what calling it does, and the one call that must come
// out of it — the action's own name first, then the token, then the member's own arguments.
//
// This is the seat side's answer to the trap `admin-actions.test.ts` covers by comparing each
// member's `.name` to its key. That sweep cannot be copied here: `bind` names its result
// `"bound <target>"` (asserted below), so no member's `.name` can equal its key. Calling each
// member is the stronger check anyway — it catches the swap the compiler is blind to *and* proves
// the token was bound in as the first argument, which a name comparison says nothing about.
const WIRING: readonly Wiring[] = [
  {
    key: 'createEpic',
    run: () => actions.createEpic(PLAN_A, { name: 'Billing' }),
    sends: ['seatCreateEpic', TOKEN, PLAN_A, { name: 'Billing' }],
  },
  {
    key: 'renameEpic',
    run: () => actions.renameEpic(PLAN_A, EPIC_1, NAME),
    sends: ['seatRenameEpic', TOKEN, PLAN_A, EPIC_1, NAME],
  },
  {
    key: 'recolourEpic',
    run: () => actions.recolourEpic(PLAN_A, EPIC_1, COLOUR),
    sends: ['seatRecolourEpic', TOKEN, PLAN_A, EPIC_1, COLOUR],
  },
  {
    key: 'reorderEpic',
    run: () => actions.reorderEpic(PLAN_A, EPIC_1, 2),
    sends: ['seatReorderEpic', TOKEN, PLAN_A, EPIC_1, 2],
  },
  {
    key: 'removeEpic',
    run: () => actions.removeEpic(PLAN_A, EPIC_1),
    sends: ['seatRemoveEpic', TOKEN, PLAN_A, EPIC_1],
  },
  {
    key: 'createFeature',
    run: () => actions.createFeature(PLAN_A, { epicId: EPIC_1, name: 'Audit log' }),
    sends: ['seatCreateFeature', TOKEN, PLAN_A, { epicId: EPIC_1, name: 'Audit log' }],
  },
  {
    key: 'renameFeature',
    run: () => actions.renameFeature(PLAN_A, FEATURE_1, NAME),
    sends: ['seatRenameFeature', TOKEN, PLAN_A, FEATURE_1, NAME],
  },
  {
    key: 'estimateFeature',
    run: () => actions.estimateFeature(PLAN_A, FEATURE_1, 8),
    sends: ['seatEstimateFeature', TOKEN, PLAN_A, FEATURE_1, 8],
  },
  {
    key: 'pinFeature',
    run: () => actions.pinFeature(PLAN_A, FEATURE_1, 3),
    sends: ['seatPinFeature', TOKEN, PLAN_A, FEATURE_1, 3],
  },
  {
    key: 'placeFeature',
    run: () => actions.placeFeature(PLAN_A, FEATURE_1, { epicId: EPIC_1, position: 1 }),
    sends: ['seatPlaceFeature', TOKEN, PLAN_A, FEATURE_1, { epicId: EPIC_1, position: 1 }],
  },
  {
    key: 'setDependencies',
    run: () => actions.setDependencies(PLAN_A, FEATURE_1, [FEATURE_2]),
    sends: ['seatSetDependencies', TOKEN, PLAN_A, FEATURE_1, [FEATURE_2]],
  },
  {
    key: 'removeFeature',
    run: () => actions.removeFeature(PLAN_A, FEATURE_1),
    sends: ['seatRemoveFeature', TOKEN, PLAN_A, FEATURE_1],
  },
  {
    key: 'createItem',
    run: () => actions.createItem(PLAN_A, { featureId: FEATURE_1, name: 'Device list' }),
    sends: ['seatCreateItem', TOKEN, PLAN_A, { featureId: FEATURE_1, name: 'Device list' }],
  },
  {
    key: 'renameItem',
    run: () => actions.renameItem(PLAN_A, ITEM_1, NAME),
    sends: ['seatRenameItem', TOKEN, PLAN_A, ITEM_1, NAME],
  },
  {
    key: 'estimateItem',
    run: () => actions.estimateItem(PLAN_A, ITEM_1, 4),
    sends: ['seatEstimateItem', TOKEN, PLAN_A, ITEM_1, 4],
  },
  {
    key: 'describeItem',
    run: () => actions.describeItem(PLAN_A, ITEM_1, DESCRIPTION),
    sends: ['seatDescribeItem', TOKEN, PLAN_A, ITEM_1, DESCRIPTION],
  },
  {
    key: 'placeItem',
    run: () => actions.placeItem(PLAN_A, ITEM_1, { featureId: FEATURE_1, position: 0 }),
    sends: ['seatPlaceItem', TOKEN, PLAN_A, ITEM_1, { featureId: FEATURE_1, position: 0 }],
  },
  {
    key: 'removeItem',
    run: () => actions.removeItem(PLAN_A, ITEM_1),
    sends: ['seatRemoveItem', TOKEN, PLAN_A, ITEM_1],
  },
  {
    key: 'bindEpic',
    run: () => actions.bindEpic(PLAN_A, EPIC_1, { token: TOKEN_PASTED, role: 'manage' }),
    sends: ['seatBindEpic', TOKEN, PLAN_A, EPIC_1, { token: TOKEN_PASTED, role: 'manage' }],
  },
  {
    key: 'unbindEpic',
    run: () => actions.unbindEpic(PLAN_A, EPIC_1),
    sends: ['seatUnbindEpic', TOKEN, PLAN_A, EPIC_1],
  },
  {
    key: 'linkItem',
    run: () => actions.linkItem(PLAN_A, ITEM_1, TASK_1),
    sends: ['seatLinkItem', TOKEN, PLAN_A, ITEM_1, TASK_1],
  },
  {
    key: 'unlinkItem',
    run: () => actions.unlinkItem(PLAN_A, ITEM_1),
    sends: ['seatUnlinkItem', TOKEN, PLAN_A, ITEM_1],
  },
  {
    key: 'createTask',
    run: () => actions.createTask(PLAN_A, ITEM_1),
    sends: ['seatCreateTask', TOKEN, PLAN_A, ITEM_1],
  },
]

beforeEach(() => {
  calls.length = 0
})

describe("the seat surface's wiring, checked by calling every member", () => {
  it.each(WIRING)('reaches the like-named seat action from $key, token first', async (wiring) => {
    await wiring.run()
    expect(calls).toEqual([wiring.sends])
  })

  // Membership, not order: `actions/seat-writes.test.ts` compares its own module's exports the same
  // way, sorted, because what this sweep has to catch is a member missing from one side or the
  // other — not a reordering of `seatPlanActions`'s object literal, which `WIRING` above happens to
  // mirror for readability but which no test needs to hold.
  it('wires all twenty-three, so the sweep above is neither empty nor short of one', () => {
    expect(WIRING).toHaveLength(23)
    expect(Object.keys(actions)).toHaveLength(23)
    expect(sorted(WIRING.map((one) => one.key))).toEqual(sorted(Object.keys(actions)))
  })

  it('binds one token and no other, whichever seat is holding the page', async () => {
    const other = seatPlanActions(MANAGE_SEAT_TOKEN)
    await actions.renameItem(PLAN_A, ITEM_1, NAME)
    await other.renameItem(PLAN_A, ITEM_1, NAME)
    expect(calls.map((one) => one[1])).toEqual([TOKEN, MANAGE_SEAT_TOKEN])
  })
})

describe('why this file calls every member rather than reading its name', () => {
  it('cannot compare a name to its key, because bind renames what it binds', () => {
    const seatRenameFeature = (): null => null
    expect(seatRenameFeature.bind(null).name).toBe('bound seatRenameFeature')
    // `bound ` and not `bound seatRenameFeature`: the mock's recorders are anonymous arrows, so the
    // prefix is all this can show. It is the load-bearing half — a member that stopped being bound
    // would lose it, and `admin-actions.test.ts`'s name-to-key sweep would become usable here.
    for (const member of Object.values(actions)) expect(member.name).toMatch(/^bound /)
  })
})
