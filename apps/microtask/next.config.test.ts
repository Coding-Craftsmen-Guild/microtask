import { resolve } from 'node:path'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { describe, expect, it } from 'vitest'
import config, { LINK_SURFACE_HEADERS } from './next.config'

const rules = async () => (await config.headers?.()) ?? []

const headersAt = async (pathname: string): Promise<Record<string, string>> => {
  const matched = (await rules()).filter((rule) => getPathMatch(rule.source, { strict: true })(pathname) !== false)
  return Object.fromEntries(matched.flatMap((rule) => rule.headers.map((one) => [one.key, one.value])))
}

const HARDENED = {
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

describe('headers on the client surface, whose every URL holds a live token', () => {
  it('names the three the surface needs, and nothing weaker', () => {
    expect(Object.fromEntries(LINK_SURFACE_HEADERS.map((one) => [one.key, one.value]))).toEqual(HARDENED)
  })

  it.each([
    '/s',
    '/s/unavailable',
    '/s/tok_CLIENTSOWNTOKEN_0001',
    '/s/tok_CLIENTSOWNTOKEN_0001/t/01M240FB4GD6PF6V0PKZVF6FD9',
    '/s/tok_CLIENTSOWNTOKEN_0001/api/projects/p/tasks/t/tabs/b/document',
    '/s/a/b/c/d/e',
    '/share/tok_CLIENTSOWNTOKEN_0001',
    '/share/a/b',
  ])('sends all three at %s', async (pathname) => {
    expect(await headersAt(pathname)).toEqual(HARDENED)
  })

  it.each(['/', '/login', '/p/01M240ERCRWWCN16Q5AHP1FZAQ', '/sales', '/shared-notes', '/api/projects/p/tasks/t/tabs/b/document'])(
    'leaves %s, which is not the client surface, to its own headers',
    async (pathname) => {
      expect(await headersAt(pathname)).toEqual({})
    },
  )
})

describe('the build config the rest of the pipeline depends on', () => {
  it('keeps standalone output rooted at the workspace', () => {
    expect(config.output).toBe('standalone')
    expect(config.outputFileTracingRoot).toBe(resolve(import.meta.dirname, '..', '..'))
  })
})
