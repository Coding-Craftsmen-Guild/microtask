import { describe, expect, it, vi } from 'vitest'
import { MANAGE_SEAT_TOKEN, PLAN_A, SEAT_TOKEN } from './testing/plan-fixture'

// Every export of the two modules this file wires, each replaced by a recorder carrying its own name. The
// same device `seat-actions.test.ts` uses, and for the same reason: what has to be proved is *which* action
// a member reaches and that the token arrived first, and a recorder that names itself proves both in one
// assertion.
const calls: unknown[][] = []

const recorder =
  (name: string) =>
  (...args: unknown[]): Promise<unknown> => {
    calls.push([name, ...args])
    return Promise.resolve({ ok: true, value: name })
  }

const SEAT_SEATS = ['seatReadSeats', 'seatCreateSeat', 'seatUpdateSeat', 'seatRevokeSeat']

const SEAT_PLAN = ['seatRenamePlan', 'seatRetimePlan', 'seatDeletePlan']

vi.mock('../../actions/seat-seats', () =>
  Object.fromEntries(SEAT_SEATS.map((name) => [name, recorder(name)])),
)

vi.mock('../../actions/seat-plan', () =>
  Object.fromEntries(SEAT_PLAN.map((name) => [name, recorder(name)])),
)

const { seatPlanOwnActions, seatSeatActions } = await import('./seat-own-actions')

const TOKEN = MANAGE_SEAT_TOKEN

const seats = seatSeatActions(TOKEN)

const own = seatPlanOwnActions(TOKEN)

interface Wiring {
  readonly key: string
  readonly run: () => Promise<unknown>
  readonly sends: readonly unknown[]
}

const SEAT_WIRING: readonly Wiring[] = [
  { key: 'list', run: () => seats.list(PLAN_A), sends: ['seatReadSeats', TOKEN, PLAN_A] },
  {
    key: 'create',
    run: () => seats.create(PLAN_A, { name: 'Ravi', role: 'view' }),
    sends: ['seatCreateSeat', TOKEN, PLAN_A, { name: 'Ravi', role: 'view' }],
  },
  {
    key: 'update',
    run: () => seats.update(PLAN_A, SEAT_TOKEN, { role: 'write' }),
    sends: ['seatUpdateSeat', TOKEN, PLAN_A, SEAT_TOKEN, { role: 'write' }],
  },
  {
    key: 'revoke',
    run: () => seats.revoke(PLAN_A, SEAT_TOKEN),
    sends: ['seatRevokeSeat', TOKEN, PLAN_A, SEAT_TOKEN],
  },
]

const OWN_WIRING: readonly Wiring[] = [
  {
    key: 'rename',
    run: () => own.rename(PLAN_A, 'Atlas rebuild'),
    sends: ['seatRenamePlan', TOKEN, PLAN_A, 'Atlas rebuild'],
  },
  {
    key: 'retime',
    run: () => own.retime(PLAN_A, { sprintLengthDays: 14 }),
    sends: ['seatRetimePlan', TOKEN, PLAN_A, { sprintLengthDays: 14 }],
  },
  { key: 'remove', run: () => own.remove(PLAN_A), sends: ['seatDeletePlan', TOKEN, PLAN_A] },
]

// Calling each member rather than comparing its `.name` to its key, which is the check
// `admin-actions.test.ts` makes and this file cannot: `bind` names its result `"bound seatRenamePlan"`, so
// no bound member's name can equal its key. Calling is the stronger check anyway — it catches a swap the
// compiler is blind to, because every member of a group shares a shape, *and* it proves the token was bound
// in as the first argument, which a name comparison says nothing about.
describe.each([
  ['the four seat-management writes', SEAT_WIRING],
  ['the three plan-level writes', OWN_WIRING],
])('%s each reach their own action with the token first', (_label, wiring) => {
  for (const { key, run, sends } of wiring) {
    it(`${key} sends the token before anything the caller passed`, async () => {
      calls.length = 0
      await run()
      expect(calls).toEqual([sends])
    })
  }
})

describe('what binding costs and what it buys', () => {
  // The property the page's leak sweep depends on: a bound member is the only way a token reaches an
  // action without crossing a client boundary as a prop (ADR 0040), and it is why that sweep has to *call*
  // what it is handed rather than read a name.
  it('names every member a bound function, which is why no name comparison is possible here', () => {
    for (const member of [...Object.values(seats), ...Object.values(own)]) {
      expect(member.name.startsWith('bound ')).toBe(true)
    }
  })

  it('binds a different token per call, the credential being per request and not per process', async () => {
    calls.length = 0
    await seatSeatActions(SEAT_TOKEN).list(PLAN_A)
    await seatPlanOwnActions(SEAT_TOKEN).rename(PLAN_A, 'Other')
    expect(calls.map((one) => one[1])).toEqual([SEAT_TOKEN, SEAT_TOKEN])
  })

  // There is no `create` among the plan-level three, and it is not an omission: `workspace:create-plan` is
  // admin-only (ADR 0009), so a seat is refused a new plan whatever its role and a member here would be a
  // control that cannot work.
  it('offers a seat no way to create a plan, that authority being the admin’s alone', () => {
    expect(Object.keys(own).sort()).toEqual(['remove', 'rename', 'retime'])
  })
})
