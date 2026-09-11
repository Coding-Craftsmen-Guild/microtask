import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { PROBLEM_CODES, Problem, ProblemCode, ValidationProblem } from './problem.js'

const problem = {
  type: '/problems/forbidden',
  title: 'Forbidden',
  status: 403,
  code: 'forbidden',
  detail: 'Not permitted: share:read',
  instance: '/v1/microtask/projects/01M240ERCRWWCN16Q5AHP1FZAQ/share-links',
}

describe('ProblemCode is a closed set (ADR 0036)', () => {
  it('accepts a code the API reports and refuses one it does not', () => {
    expect(ProblemCode.safeParse('conflict').success).toBe(true)
    expect(ProblemCode.safeParse('teapot').success).toBe(false)
  })

  it('names the three per-cause 401s, which a generic unauthorized cannot tell apart', () => {
    for (const code of ['unknown_service', 'no_principal', 'unknown_principal']) {
      expect(ProblemCode.safeParse(code).success).toBe(true)
    }
  })

  it('names the catch-all a status outside the mapping is reported under', () => {
    expect(ProblemCode.safeParse('http_error').success).toBe(true)
  })

  it('lists each code exactly once, so a switch cannot have a dead arm', () => {
    expect([...new Set(PROBLEM_CODES)]).toHaveLength(PROBLEM_CODES.length)
  })
})

describe('the problem documents a client parses', () => {
  it('accepts the RFC 7807 document every error carries', () => {
    expect(Problem.safeParse(problem).error?.issues ?? []).toEqual([])
  })

  it('leaves code a plain string, because a proxy in between sends whatever it likes', () => {
    expect(Problem.safeParse({ ...problem, code: 'http_502' }).success).toBe(true)
  })

  const validation = {
    ...problem,
    status: 422,
    code: 'invalid',
    in: 'json',
    errors: [{ path: 'tabs.0.id', message: 'Invalid input', code: 'invalid_type' }],
  }

  it('requires in and errors on a 422, so a form knows which field to point at', () => {
    expect(ValidationProblem.safeParse(validation).error?.issues ?? []).toEqual([])
    expect(ValidationProblem.safeParse(problem).success).toBe(false)
  })

  it.each(['in', 'errors'] as const)('refuses a 422 missing %s alone, not only both at once', (key) => {
    const { [key]: dropped, ...without } = validation
    expect(dropped).toBeDefined()
    expect(ValidationProblem.safeParse(without).success).toBe(false)
  })

  it('refuses a validation target the hook cannot name', () => {
    const wrong = { ...problem, in: 'body', errors: [] }
    expect(ValidationProblem.safeParse(wrong).success).toBe(false)
  })

  it('is reachable from the barrel', () => {
    expect(contracts.Problem).toBe(Problem)
    expect(contracts.ValidationProblem).toBe(ValidationProblem)
    expect(contracts.ProblemCode).toBe(ProblemCode)
    expect(contracts.PROBLEM_CODES).toBe(PROBLEM_CODES)
  })
})
