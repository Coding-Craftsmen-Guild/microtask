import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '@repo/app-session/crypto'
import { payloadOf } from '../lib/principal'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const TOKEN = 'a_plan_seats_token1'
const ADMIN = seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))
const consulted: string[] = []

vi.mock('next/headers', () => ({
  cookies: () => {
    consulted.push('cookies')
    return Promise.resolve({ get: () => ({ name: 'mp_admin', value: ADMIN }), set: () => undefined })
  },
  headers: () => {
    consulted.push('headers')
    return Promise.resolve(new Headers())
  },
}))

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('not found')
  },
}))

const sent: { url: string; init: RequestInit }[] = []
let answer: () => Response = () => Response.json({ plans: [] })

const problem = (status: number, detail = `status ${String(status)}`): Response =>
  new Response(
    JSON.stringify({ type: '/problems/x', title: 't', status, code: 'x', detail, instance: '/v1/x' }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(answer())
  })
  sent.length = 0
  consulted.length = 0
  answer = () => Response.json({ plans: [] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { linkCall, linkRead } = await import('./link-call')

const headerOf = (name: string): string | undefined =>
  (sent[0]?.init.headers as Record<string, string> | undefined)?.[name]

const redirectOf = async (attempt: Promise<unknown>): Promise<string> => {
  const outcome = await attempt.then(
    (value) => value,
    (error: unknown) => error,
  )
  if (outcome instanceof Redirected) return outcome.location
  throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`)
}

const outcomeOf = (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    (value) => value,
    (error: unknown) => error,
  )

describe('linkCall — the token handed in is the only authority', () => {
  it('answers the value the call produced, presenting that token as the bearer', async () => {
    const result = await linkCall(TOKEN, async (api) => (await api.plans.list()).plans)
    expect(result).toEqual({ ok: true, value: [] })
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headerOf('x-api-key')).toBe('the-macroplan-service-key')
  })

  it('reads no cookie and no header, so an mp_admin on the same browser is never consulted', async () => {
    await linkCall(TOKEN, (api) => api.plans.list())
    expect(consulted).toEqual([])
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('hands the call a link client, never an admin one', async () => {
    let credential: string | undefined
    await linkCall(TOKEN, (api) => {
      credential = api.credential
      return Promise.resolve(null)
    })
    expect(credential).toBe('link')
  })

  it.each([['', 'empty'], ['unavailable', 'the terminal segment'], [`${TOKEN}\n`, 'a newline']])(
    'sends the segment %j, %s, to the terminal page without a request',
    async (segment) => {
      const call = vi.fn(() => Promise.resolve(1))
      expect(await redirectOf(linkCall(segment, call))).toBe(LINK_UNAVAILABLE_PATH)
      expect(call).not.toHaveBeenCalled()
      expect(sent).toHaveLength(0)
    },
  )

  it('sends a 401 — a revoked or unknown token — to the terminal page and never to /login', async () => {
    answer = () => problem(401)
    expect(await redirectOf(linkCall(TOKEN, (api) => api.plans.list()))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('answers a 403 as a failure in plain words, never as a success or the API own sentence', async () => {
    answer = () => problem(403, 'Not permitted: plan:retime')
    expect(await linkCall(TOKEN, (api) => api.plans.list())).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.link),
    })
  })

  it('answers a 409 once, as a conflict, and never retries it', async () => {
    answer = () => problem(409, 'Changed elsewhere')
    expect(await linkCall(TOKEN, (api) => api.plans.list())).toMatchObject({ ok: false, status: 409 })
    expect(sent).toHaveLength(1)
  })

  it('answers an unreachable API as a failure with status 0, not as a dead link', async () => {
    const result = await linkCall(TOKEN, () => Promise.reject(new TypeError('fetch failed')))
    expect(result).toMatchObject({ ok: false, status: 0 })
  })
})

describe('linkRead', () => {
  it.each([404, 422])('renders the route not-found page for a %i', async (status) => {
    answer = () => problem(status)
    expect(await outcomeOf(linkRead(TOKEN, (api) => api.plans.list()))).toBeInstanceOf(NotFound)
  })

  it('answers any other refusal in the link surface own plain words', async () => {
    answer = () => problem(500, 'Boom.')
    expect(await linkRead(TOKEN, (api) => api.plans.list())).toEqual({
      ok: false,
      status: 500,
      detail: plainRefusal(500, ACTION_REFUSALS.link),
    })
  })

  it('sends a 401 to the terminal page', async () => {
    answer = () => problem(401)
    expect(await redirectOf(linkRead(TOKEN, (api) => api.plans.list()))).toBe(LINK_UNAVAILABLE_PATH)
  })
})
