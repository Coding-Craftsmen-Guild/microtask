import { resolve } from 'node:path'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { describe, expect, it } from 'vitest'
import config, { LINK_SURFACE_HEADERS, LINK_SURFACE_SOURCES } from './next.config'

const HERE = resolve(process.cwd())

const rules = async () => (await config.headers?.()) ?? []

const headersAt = async (pathname: string): Promise<Record<string, string>> => {
  const matches = (source: string): boolean => getPathMatch(source, { strict: true })(pathname) !== false
  const matched = (await rules()).filter((rule) => matches(rule.source))
  return Object.fromEntries(matched.flatMap((rule) => rule.headers.map((one) => [one.key, one.value])))
}

const HARDENED = {
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

describe('the build this app deploys as (ADR 0026)', () => {
  it('builds standalone, which is what makes the runner image node_modules-free', () => {
    expect(config.output).toBe('standalone')
  })

  it('traces from the repository root, not this directory, so workspace packages are copied', () => {
    expect(config.outputFileTracingRoot).toBe(resolve(HERE, '..', '..'))
    expect(config.outputFileTracingRoot).not.toBe(HERE)
  })
})

describe('headers on the link surface, whose every URL holds a live token', () => {
  it('names the three the surface needs, and nothing weaker', () => {
    expect(Object.fromEntries(LINK_SURFACE_HEADERS.map((one) => [one.key, one.value]))).toEqual(HARDENED)
  })

  it.each([
    '/s',
    '/s/unavailable',
    '/s/tok_A_PLAN_SEAT_0001',
    '/s/tok_A_PLAN_SEAT_0001/anything',
    '/s/a/b/c/d/e',
  ])('sends all three at %s', async (pathname) => {
    expect(await headersAt(pathname)).toEqual(HARDENED)
  })

  it.each([
    '/',
    '/login',
    '/plans',
    '/plans/01M240ERCRWWCN16Q5AHP1FZAQ',
    '/splash',
    '/sales',
    '/api/anything',
  ])(
    'leaves %s, which is not the link surface, to its own headers',
    async (pathname) => {
      expect(await headersAt(pathname)).toEqual({})
    },
  )

  it('declares one source and not Microtask’s legacy pair, this app having circulated no old link', () => {
    expect(LINK_SURFACE_SOURCES).toEqual(['/s/:path*'])
    expect(LINK_SURFACE_SOURCES).not.toContain('/share/:path*')
  })

  it('leaves /share unhardened, because no route answers there at all', async () => {
    expect(await headersAt('/share/tok_A_PLAN_SEAT_0001')).toEqual({})
  })

  it('applies each rule to one source, so a rule cannot cover a path its pattern does not name', async () => {
    expect((await rules()).map((rule) => rule.source)).toEqual([...LINK_SURFACE_SOURCES])
  })
})
