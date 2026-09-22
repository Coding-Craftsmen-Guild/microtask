import { redirect } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from './action-result'
import { eachOrNoAnswer, NO_ANSWER, orNoAnswer } from './no-answer'

const dropped = () => Promise.reject(new TypeError('Failed to fetch'))

const redirection = (): unknown => {
  try {
    redirect('/login?next=%2F')
  } catch (error) {
    return error
  }
  throw new Error('redirect did not throw')
}

describe('orNoAnswer', () => {
  it('answers what the action answered when it answers', async () => {
    const value: ActionResult<string> = { ok: true, value: 'stored' }
    expect(await orNoAnswer(() => Promise.resolve(value))()).toBe(value)
  })

  it('passes a refusal through as the action said it, rather than as no answer', async () => {
    const refusal = { ok: false, status: 409, detail: 'This list changed.' } as const
    expect(await orNoAnswer(() => Promise.resolve(refusal))()).toBe(refusal)
  })

  it('turns a dropped connection into the failed outcome a refusal has, with status 0', async () => {
    await expect(orNoAnswer(dropped)()).resolves.toEqual({ ok: false, status: 0, detail: NO_ANSWER.detail })
  })

  it('turns an action that throws before it returns a promise into the same failure', async () => {
    const throwing = (): Promise<ActionResult<null>> => {
      throw new Error('Server Action "abc" was not found on the server.')
    }
    await expect(orNoAnswer(throwing)()).resolves.toEqual(NO_ANSWER)
  })

  it('hands the action its arguments unchanged', async () => {
    const call = vi.fn((a: string, b: number) => Promise.resolve({ ok: true as const, value: `${a}${String(b)}` }))
    await orNoAnswer(call)('x', 1)
    expect(call).toHaveBeenCalledWith('x', 1)
  })

  it('lets a redirect through untouched, since Next navigates on it and a failure would be a false one', async () => {
    const error = redirection()
    await expect(orNoAnswer(() => Promise.reject(error))()).rejects.toBe(error)
  })

  it('says nothing was answered, and does not claim nothing was changed', () => {
    expect(NO_ANSWER.detail).toBe('The server did not answer. Check your connection and try again.')
  })
})

describe('eachOrNoAnswer', () => {
  it('guards every member of an actions object and keeps its name', async () => {
    const actions = {
      list: vi.fn<() => Promise<ActionResult<number>>>(dropped),
      create: vi.fn<() => Promise<ActionResult<number>>>(() => Promise.resolve({ ok: true, value: 1 })),
    }
    const guarded = eachOrNoAnswer(actions)
    expect(Object.keys(guarded)).toEqual(['list', 'create'])
    await expect(guarded.list()).resolves.toEqual(NO_ANSWER)
    expect(await guarded.create()).toEqual({ ok: true, value: 1 })
  })
})
