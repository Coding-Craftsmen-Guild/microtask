import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_A } from '../testing/plan-fixture'
import { SEAT_CREATED, SEAT_REVOKED, SEAT_UPDATED } from './seat-words'
import {
  usePlanSeats,
  withoutLineage,
  type PlanSeat,
  type PlanSeatActions,
} from './use-plan-seats'

const ROOT = 'a_root_seats_token1'

const CHILD = 'a_child_seats_token'

const GRAND = 'a_grand_seats_token'

const OTHER = 'a_other_seats_token'

const MINTED = 'a_minted_seats_tokn'

const seat = (token: string, over: Partial<PlanSeat> = {}): PlanSeat => ({
  token,
  name: token,
  role: 'view',
  createdBy: null,
  createdAt: '2026-09-20T09:00:00.000Z',
  ...over,
})

// A lineage the fixture plan does not have: its three seats were all minted by the admin, and what a
// revoke has to drop is a seat's **descendants**. Three generations and one unrelated seat, so the walk
// below is asserted transitive rather than one level deep.
const lineage = (): readonly PlanSeat[] => [
  seat(ROOT, { name: 'Ravi', role: 'manage' }),
  seat(CHILD, { name: 'Ivo', role: 'write', createdBy: ROOT }),
  seat(GRAND, { name: 'Dana', createdBy: CHILD }),
  seat(OTHER, { name: 'Pia' }),
]

const doubles = (): PlanSeatActions => ({
  list: vi.fn<PlanSeatActions['list']>(() => Promise.resolve({ ok: true, value: lineage() })),
  create: vi.fn<PlanSeatActions['create']>((_planId, minted) =>
    Promise.resolve({ ok: true, value: seat(MINTED, { name: minted.name, role: minted.role }) }),
  ),
  update: vi.fn<PlanSeatActions['update']>((_planId, token, change) => {
    const was = seat(token)
    const value = { ...was, name: change.name ?? was.name, role: change.role ?? was.role }
    return Promise.resolve({ ok: true, value })
  }),
  revoke: vi.fn<PlanSeatActions['revoke']>(() => Promise.resolve({ ok: true, value: undefined })),
})

const REFUSED = { ok: false as const, status: 403, detail: 'You are not allowed to make that change.' }

const held = (actions: PlanSeatActions = doubles()) => ({
  actions,
  ...renderHook(() => usePlanSeats(PLAN_A, actions)),
})

const opened = async (actions?: PlanSeatActions) => {
  const view = held(actions)
  await act(async () => {
    await view.result.current.load()
  })
  return view
}

interface Deferred<Value> {
  readonly promise: Promise<Value>
  settle: (value: Value) => void
}

const deferred = <Value,>(): Deferred<Value> => {
  let settle: (value: Value) => void = () => undefined
  const promise = new Promise<Value>((resolve) => {
    settle = resolve
  })
  return { promise, settle: (value) => settle(value) }
}

describe('the seats a manager holds only while it is open', () => {
  it('asks for nothing until it is told to load, which is what the dialog opening does', () => {
    const { actions, result } = held()
    expect(result.current.state).toBe('idle')
    expect(result.current.seats).toEqual([])
    expect(actions.list).not.toHaveBeenCalled()
  })

  it('asks for this plan’s seats and holds every one it is answered, tokens included', async () => {
    const { actions, result } = await opened()
    expect(actions.list).toHaveBeenCalledWith(PLAN_A)
    expect(result.current.seats.map((one) => one.token)).toEqual([ROOT, CHILD, GRAND, OTHER])
    expect(result.current.state).toBe('ready')
    expect(result.current.problem).toBe('')
  })

  it('ends in failed with the sentence, so a refused list offers Try again and not a spinner', async () => {
    const actions = doubles()
    vi.mocked(actions.list).mockResolvedValueOnce(REFUSED)
    const { result } = await opened(actions)
    expect(result.current.state).toBe('failed')
    expect(result.current.problem).toBe(REFUSED.detail)
    expect(result.current.seats).toEqual([])
  })

  it('answers a refusal for a list the server never answers, rather than loading for ever', async () => {
    const actions = doubles()
    vi.mocked(actions.list).mockRejectedValueOnce(new Error('socket closed'))
    const { result } = await opened(actions)
    expect(result.current.state).toBe('failed')
    expect(result.current.problem).toContain('The server did not answer')
  })

  it('forgets every seat it held when the dialog closes, so no token outlives it', async () => {
    const { result } = await opened()
    act(() => {
      result.current.forget()
    })
    expect(result.current.seats).toEqual([])
    expect(result.current.state).toBe('idle')
    expect(result.current.problem).toBe('')
    expect(result.current.notice).toBe('')
  })
})

describe('the generation the answers are checked against', () => {
  it('drops a list that arrives after the dialog closed, rather than putting its tokens back', async () => {
    const actions = doubles()
    const late = deferred<Awaited<ReturnType<PlanSeatActions['list']>>>()
    vi.mocked(actions.list).mockReturnValueOnce(late.promise)
    const { result } = held(actions)
    void result.current.load()
    act(() => {
      result.current.forget()
    })
    await act(async () => {
      late.settle({ ok: true, value: lineage() })
      await late.promise
    })
    expect(result.current.seats).toEqual([])
    expect(result.current.state).toBe('idle')
  })

  it('drops the first open’s answer when a second open is already waiting, keeping the newer one', async () => {
    const actions = doubles()
    const first = deferred<Awaited<ReturnType<PlanSeatActions['list']>>>()
    const second = deferred<Awaited<ReturnType<PlanSeatActions['list']>>>()
    vi.mocked(actions.list).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = held(actions)
    void result.current.load()
    void result.current.load()
    await act(async () => {
      first.settle({ ok: true, value: lineage() })
      second.settle({ ok: true, value: [seat(OTHER, { name: 'Pia' })] })
      await second.promise
    })
    expect(result.current.seats.map((one) => one.token)).toEqual([OTHER])
    expect(result.current.state).toBe('ready')
  })

  it('drops a mint that answers after the dialog closed, rather than holding the token it minted', async () => {
    const actions = doubles()
    const late = deferred<Awaited<ReturnType<PlanSeatActions['create']>>>()
    vi.mocked(actions.create).mockReturnValueOnce(late.promise)
    const { result } = await opened(actions)
    void result.current.mint({ name: 'Late', role: 'view' })
    act(() => {
      result.current.forget()
    })
    await act(async () => {
      late.settle({ ok: true, value: seat(MINTED, { name: 'Late' }) })
      await late.promise
    })
    expect(result.current.seats).toEqual([])
    expect(result.current.notice).toBe('')
  })
})

describe('the three writes a manager makes', () => {
  it('puts a minted seat at the end of the list it is holding and says so', async () => {
    const { actions, result } = await opened()
    await act(async () => {
      expect(await result.current.mint({ name: 'Pia', role: 'write' })).toBe(true)
    })
    expect(actions.create).toHaveBeenCalledWith(PLAN_A, { name: 'Pia', role: 'write' })
    expect(result.current.seats.map((one) => one.token)).toEqual([ROOT, CHILD, GRAND, OTHER, MINTED])
    expect(result.current.notice).toBe(SEAT_CREATED)
  })

  it('answers false for a refused mint, says why, and adds no row', async () => {
    const actions = doubles()
    vi.mocked(actions.create).mockResolvedValueOnce(REFUSED)
    const { result } = await opened(actions)
    await act(async () => {
      expect(await result.current.mint({ name: 'Pia', role: 'write' })).toBe(false)
    })
    expect(result.current.seats).toHaveLength(4)
    expect(result.current.problem).toBe(REFUSED.detail)
    expect(result.current.notice).toBe('')
  })

  it('replaces an edited seat in place, the token being what a rename keeps', async () => {
    const { actions, result } = await opened()
    await act(async () => {
      await result.current.edit(CHILD, { name: 'Ivo at ACME' })
    })
    expect(actions.update).toHaveBeenCalledWith(PLAN_A, CHILD, { name: 'Ivo at ACME' })
    const edited = result.current.seats[1]
    expect(edited?.token).toBe(CHILD)
    expect(edited?.name).toBe('Ivo at ACME')
    expect(result.current.notice).toBe(SEAT_UPDATED)
  })

  it('drops a revoked seat and every seat held that was minted through it', async () => {
    const { actions, result } = await opened()
    await act(async () => {
      await result.current.revoke(ROOT)
    })
    expect(actions.revoke).toHaveBeenCalledWith(PLAN_A, ROOT)
    expect(result.current.seats.map((one) => one.token)).toEqual([OTHER])
    expect(result.current.notice).toBe(SEAT_REVOKED)
  })

  it('keeps every row where the revoke was refused, the plan being unchanged', async () => {
    const actions = doubles()
    vi.mocked(actions.revoke).mockResolvedValueOnce(REFUSED)
    const { result } = await opened(actions)
    await act(async () => {
      await result.current.revoke(ROOT)
    })
    expect(result.current.seats).toHaveLength(4)
    expect(result.current.problem).toBe(REFUSED.detail)
  })
})

describe('the lineage a revoke takes with it, walked over the seats held', () => {
  it('drops the seat, its children and their children, however deep', () => {
    expect(withoutLineage(lineage(), ROOT).map((one) => one.token)).toEqual([OTHER])
    expect(withoutLineage(lineage(), CHILD).map((one) => one.token)).toEqual([ROOT, OTHER])
    expect(withoutLineage(lineage(), GRAND).map((one) => one.token)).toEqual([ROOT, CHILD, OTHER])
  })

  it('drops nothing at all for a token the list does not hold', () => {
    expect(withoutLineage(lineage(), MINTED)).toHaveLength(4)
  })

  it('terminates on a cycle, which the API cannot produce and a list cannot rule out', () => {
    const knotted = [
      seat(ROOT, { createdBy: CHILD }),
      seat(CHILD, { createdBy: ROOT }),
      seat(OTHER),
    ]
    expect(withoutLineage(knotted, ROOT).map((one) => one.token)).toEqual([OTHER])
  })
})
