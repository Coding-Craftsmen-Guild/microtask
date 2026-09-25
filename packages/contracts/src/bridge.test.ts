import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  BindEpicPayload,
  BoundTaskList,
  BridgeEpicRow,
  BridgeItemRow,
  EpicBindingView,
  LinkItemPayload,
  PlanBridgeView,
} from './bridge.js'

const ID = '01M240ERCRWWCN16Q5AHP1FZF1'
const TOKEN = 'shr_bridge_test_token_1234'

describe('BindEpicPayload', () => {
  it('accepts a well-formed token and role', () => {
    expect(BindEpicPayload.safeParse({ token: TOKEN, role: 'view' }).success).toBe(true)
  })

  it('refuses a malformed token', () => {
    expect(BindEpicPayload.safeParse({ token: 'too-short', role: 'view' }).success).toBe(false)
  })

  it('refuses a missing token', () => {
    expect(BindEpicPayload.safeParse({ role: 'view' }).success).toBe(false)
  })

  it('refuses a role the policy does not name', () => {
    expect(BindEpicPayload.safeParse({ token: TOKEN, role: 'admin' }).success).toBe(false)
  })

  it('refuses role: write, because a binding never grants write (design §7.2)', () => {
    // §7.2 fixes a binding to view/manage; write is a plan-share concept the bridge never carries.
    expect(BindEpicPayload.safeParse({ token: TOKEN, role: 'write' }).success).toBe(false)
  })
})

describe('LinkItemPayload', () => {
  it('accepts a well-formed task id', () => {
    expect(LinkItemPayload.safeParse({ taskId: ID }).success).toBe(true)
  })

  it('refuses a taskId that is not a ULID', () => {
    expect(LinkItemPayload.safeParse({ taskId: 'not-a-ulid' }).success).toBe(false)
  })
})

describe('EpicBindingView', () => {
  it('accepts a well-formed value', () => {
    expect(EpicBindingView.safeParse({ projectId: ID, role: 'manage' }).success).toBe(true)
  })
})

describe('BridgeEpicRow', () => {
  it("accepts state: 'unlinked' with no binding", () => {
    expect(BridgeEpicRow.safeParse({ epicId: ID, state: 'unlinked' }).success).toBe(true)
  })

  it("accepts state: 'bound' with a binding", () => {
    const value = { epicId: ID, state: 'bound', binding: { projectId: ID, role: 'view' } }
    expect(BridgeEpicRow.safeParse(value).success).toBe(true)
  })
})

describe('BridgeItemRow', () => {
  it('accepts a value with taskName present', () => {
    const value = { itemId: ID, progress: { done: 1, total: 2 }, taskName: 'Ship it' }
    expect(BridgeItemRow.safeParse(value).success).toBe(true)
  })

  it('accepts a value with taskName absent, which is what a view-role reader is told (§7.3)', () => {
    const value = { itemId: ID, progress: { done: 1, total: 2 } }
    expect(BridgeItemRow.safeParse(value).success).toBe(true)
  })
})

describe('PlanBridgeView', () => {
  const item = { itemId: ID, progress: { done: 0, total: 0 } }

  it('parses with epics absent', () => {
    expect(PlanBridgeView.safeParse({ items: [item] }).success).toBe(true)
  })

  it('parses with epics present', () => {
    const epics = [{ epicId: ID, state: 'unlinked' }]
    expect(PlanBridgeView.safeParse({ epics, items: [item] }).success).toBe(true)
  })

  it('refuses items absent, since items is required unlike the admin-only epics block', () => {
    expect(PlanBridgeView.safeParse({}).success).toBe(false)
  })
})

describe('BoundTaskList', () => {
  it('accepts a well-formed value', () => {
    expect(BoundTaskList.safeParse({ tasks: [{ id: ID, name: 'Ship it' }] }).success).toBe(true)
  })
})

const leakCases: ReadonlyArray<readonly [string, z.ZodType, Record<string, unknown>]> = [
  ['EpicBindingView', EpicBindingView, { projectId: ID, role: 'view' }],
  ['BridgeEpicRow', BridgeEpicRow, { epicId: ID, state: 'bound', binding: { projectId: ID, role: 'view' } }],
  ['BridgeItemRow', BridgeItemRow, { itemId: ID, progress: { done: 1, total: 2 }, taskName: 'Ship it' }],
  ['PlanBridgeView', PlanBridgeView, { items: [{ itemId: ID, progress: { done: 0, total: 0 } }] }],
  ['BoundTaskList', BoundTaskList, { tasks: [{ id: ID, name: 'Ship it' }] }],
]

const LEAKED = 'shr_leaked_credential'

// A stored `EpicBinding` (plan.ts) is `{ projectId, role, sealedToken }`, and these two schemas
// are the ones built *from* one — so the mistake that will actually be made is `binding: stored`
// and `epics: [{ ..., binding: stored }]`, which puts the token one level down where a top-level
// injection never looks. Nested rather than spread at the root for exactly that reason.
const nestedLeakCases: ReadonlyArray<readonly [string, z.ZodType, Record<string, unknown>]> = [
  [
    'BridgeEpicRow, handed a stored binding whole',
    BridgeEpicRow,
    { epicId: ID, state: 'bound', binding: { projectId: ID, role: 'view', sealedToken: LEAKED } },
  ],
  [
    'PlanBridgeView, whose epics rows each carry one',
    PlanBridgeView,
    {
      epics: [
        { epicId: ID, state: 'bound', binding: { projectId: ID, role: 'manage', sealedToken: LEAKED } },
      ],
      items: [{ itemId: ID, progress: { done: 0, total: 0 } }],
    },
  ],
]

describe('a view schema in this file never lets a sealed token pass through (design §7.2)', () => {
  it('covers every view schema declared in bridge.ts, so the sweep below cannot cover nothing', () => {
    expect(leakCases).toHaveLength(5)
  })

  it.each(leakCases)('%s strips an injected sealedToken', (_name, schema, value) => {
    const parsed = schema.parse({ ...value, sealedToken: LEAKED })
    expect(JSON.stringify(parsed)).not.toContain(LEAKED)
  })

  it.each(nestedLeakCases)('%s strips it from the nested binding too', (_name, schema, value) => {
    const parsed = schema.parse(value)
    expect(JSON.stringify(parsed)).not.toContain(LEAKED)
  })

  // Not vacuous: the two values above really do carry the token before parsing, so the two
  // assertions could fail. A sweep over values that never held the string would pass for ever.
  it('is not vacuous: each nested value holds the token before it is parsed', () => {
    for (const [, , value] of nestedLeakCases) expect(JSON.stringify(value)).toContain(LEAKED)
  })
})
