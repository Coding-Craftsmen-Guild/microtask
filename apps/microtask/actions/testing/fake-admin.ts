import { ApiError, type AdminClient } from '@repo/api-client'
import { vi, type Mock } from 'vitest'

type AnyCall = Mock<(...args: never[]) => Promise<unknown>>

/** Every operation an action in this directory reaches, each one a recording double. */
export interface FakeAdmin {
  readonly projects: Record<'list' | 'create' | 'read' | 'rename' | 'remove', AnyCall>
  readonly folders: Record<'list' | 'create' | 'reorder' | 'rename' | 'remove', AnyCall>
  readonly tasks: Record<'create' | 'reorder' | 'read' | 'rename' | 'move' | 'remove', AnyCall>
  readonly shareLinks: Record<'list' | 'create' | 'update' | 'revoke', AnyCall>
}

const calls = <Name extends string>(names: readonly Name[]): Record<Name, AnyCall> =>
  Object.fromEntries(names.map((name) => [name, vi.fn()])) as unknown as Record<Name, AnyCall>

/** A fresh double with nothing answered yet. */
export const fakeAdmin = (): FakeAdmin => ({
  projects: calls(['list', 'create', 'read', 'rename', 'remove']),
  folders: calls(['list', 'create', 'reorder', 'rename', 'remove']),
  tasks: calls(['create', 'reorder', 'read', 'rename', 'move', 'remove']),
  shareLinks: calls(['list', 'create', 'update', 'revoke']),
})

/** The double, typed as the client `apiForSession` hands back. */
export const asClient = (fake: FakeAdmin): AdminClient => fake as unknown as AdminClient

/** A problem the API could answer with. */
export const problem = (status: number, detail = `status ${String(status)}`): ApiError =>
  new ApiError({ status, code: 'x', detail, instance: '/v1/microtask/projects' })

/** What `redirect` throws in these tests, carrying where it was sent. */
export class Redirected extends Error {
  /** Records the location `redirect` was handed. */
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

/** Settles an action that is expected to redirect, and answers where to. */
export const redirectOf = async (attempt: Promise<unknown>): Promise<string> => {
  const outcome = await attempt.then(
    () => null,
    (error: unknown) => error,
  )
  if (!(outcome instanceof Redirected)) throw new Error(`expected a redirect, got ${String(outcome)}`)
  return outcome.location
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A ULID-shaped id that differs by its last character, so fixtures stay readable. */
export const ulid = (n: number): string =>
  `01HZZZZZZZZZZZZZZZZZZZZZZ${ULID_ALPHABET.charAt(n % 32)}`
