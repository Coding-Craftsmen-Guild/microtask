import { describe, expect, it } from 'vitest'
import { createTransport } from './transport.js'
import type { Fetcher } from './types.js'

const ok = (): Response =>
  new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })

const recording = () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: Fetcher = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(ok())
  }
  return { calls, fetch }
}

const passthrough = { parse: (input: unknown): unknown => input }

const transportWith = (fetch: Fetcher) =>
  createTransport({ baseUrl: 'https://api.example.test', serviceKey: 'svc', fetch }, 'token')

describe('a call can be cancelled, which is why Call carries a signal (ADR 0036)', () => {
  it('issues no request at all when the signal is already aborted', async () => {
    const { calls, fetch } = recording()
    const controller = new AbortController()
    controller.abort()
    await expect(
      transportWith(fetch).json({ method: 'GET', path: '/v1/x', signal: controller.signal }, passthrough),
    ).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('rejects with the abort reason rather than with a generic failure', async () => {
    const { fetch } = recording()
    const controller = new AbortController()
    controller.abort(new Error('the search moved on'))
    await expect(
      transportWith(fetch).json({ method: 'GET', path: '/v1/x', signal: controller.signal }, passthrough),
    ).rejects.toThrow('the search moved on')
  })

  it('issues no request for a body-less call either, so empty() is not a way past the check', async () => {
    const { calls, fetch } = recording()
    const controller = new AbortController()
    controller.abort()
    await expect(
      transportWith(fetch).empty({ method: 'DELETE', path: '/v1/x', signal: controller.signal }),
    ).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('hands the signal to fetch, so an abort after dispatch reaches the request', async () => {
    const { calls, fetch } = recording()
    const controller = new AbortController()
    await transportWith(fetch).json(
      { method: 'GET', path: '/v1/x', signal: controller.signal },
      passthrough,
    )
    expect(calls[0]?.init.signal).toBe(controller.signal)
  })

  it('sends no signal key when the call carries none, so nothing is passed as undefined', async () => {
    const { calls, fetch } = recording()
    await transportWith(fetch).json({ method: 'GET', path: '/v1/x' }, passthrough)
    expect(Object.hasOwn(calls[0]?.init ?? {}, 'signal')).toBe(false)
  })

  it('still sends a body-carrying call with its signal, both halves of initFor being threaded', async () => {
    const { calls, fetch } = recording()
    const controller = new AbortController()
    await transportWith(fetch).json(
      { method: 'POST', path: '/v1/x', body: { name: 'Ship it' }, signal: controller.signal },
      passthrough,
    )
    expect([calls[0]?.init.body, calls[0]?.init.signal]).toEqual([
      '{"name":"Ship it"}',
      controller.signal,
    ])
  })

  it('proceeds normally while the signal is unaborted, so the guard is not simply always on', async () => {
    const { calls, fetch } = recording()
    const controller = new AbortController()
    const answered = await transportWith(fetch).json(
      { method: 'GET', path: '/v1/x', signal: controller.signal },
      passthrough,
    )
    expect(answered).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
  })
})
