import { describe, expect, it } from 'vitest'
import { PROBLEM_CODES, Problem, ProblemCode, ValidationProblem } from '@repo/contracts'
import * as kernel from '@repo/kernel'
import { Conflict, Forbidden, Invalid, NotFound } from '@repo/kernel'
import { CREDENTIAL_REFUSALS } from '../auth/require-principal.js'
import { GUARDED_PREFIX, TOKENS, adminJson, asLink, buildApp } from '../testing/harness.js'
import { MEANINGS, UNMAPPED, codeForStatus } from './problem.js'

const emitted = (): readonly string[] => [
  ...Object.values(MEANINGS).map((meaning) => meaning.code),
  UNMAPPED.code,
  ...Object.keys(CREDENTIAL_REFUSALS),
]

describe('ProblemCode is the set this API can actually emit (ADR 0036)', () => {
  it('omits nothing the API reports', () => {
    const contracted: readonly string[] = PROBLEM_CODES
    expect(emitted().filter((code) => !contracted.includes(code))).toEqual([])
  })

  it('invents nothing the API cannot report, so a switch has no dead arm', () => {
    const sources = new Set(emitted())
    expect(PROBLEM_CODES.filter((code) => !sources.has(code))).toEqual([])
  })

  it('enumerates the real sources rather than a list written twice', () => {
    for (const [status, meaning] of Object.entries(MEANINGS)) {
      expect(codeForStatus(Number(status))).toBe(meaning.code)
    }
    expect(codeForStatus(418)).toBe(UNMAPPED.code)
    expect(Object.keys(CREDENTIAL_REFUSALS)).toEqual([
      'unknown_service',
      'no_principal',
      'unknown_principal',
    ])
  })

  it('parses every code the API emits, which is what a client switches on', () => {
    for (const code of emitted()) expect(ProblemCode.safeParse(code).success).toBe(true)
  })
})

describe('the codes a domain error carries are published too', () => {
  const thrown = [new NotFound('x'), new Forbidden('x'), new Invalid('x'), new Conflict('x')]

  it('publishes every AppError code, the one path that reports a code the API did not choose', () => {
    const contracted: readonly string[] = PROBLEM_CODES
    expect(thrown.map((err) => err.code).filter((code) => !contracted.includes(code))).toEqual([])
  })

  it('enumerates every AppError the kernel exports, so a new one cannot slip past this', () => {
    expect(thrown.map((err) => err.name)).toEqual(['NotFound', 'Forbidden', 'Invalid', 'Conflict'])
    expect(Object.keys(kernel).filter((name) => name.endsWith('Error'))).toEqual(['AppError'])
  })
})

describe('the published problem shapes describe what the API actually sends', () => {
  const get = async (path: string, headers: Record<string, string>) =>
    (await buildApp()).request(path, { method: 'GET', headers })

  const post = async (path: string, headers: Record<string, string>, body: string) =>
    (await buildApp()).request(path, { method: 'POST', headers, body })

  it('parses a real 401 against Problem, cause code and all', async () => {
    const response = await get(`${GUARDED_PREFIX}/projects`, {})
    expect(response.status).toBe(401)
    const parsed = Problem.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.data?.code).toBe('unknown_service')
  })

  it('parses a real 403 against Problem', async () => {
    const response = await get(`${GUARDED_PREFIX}/projects`, asLink(TOKENS.p1View))
    expect(response.status).toBe(403)
    expect(Problem.safeParse(await response.json()).error?.issues ?? []).toEqual([])
  })

  it('parses a real 422 against ValidationProblem, which is what puts a message on a field', async () => {
    const response = await post(`${GUARDED_PREFIX}/projects`, adminJson(), JSON.stringify({}))
    expect(response.status).toBe(422)
    const parsed = ValidationProblem.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.data?.in).toBe('json')
    expect(parsed.data?.errors.map((issue) => issue.path)).toEqual(['name'])
  })
})
