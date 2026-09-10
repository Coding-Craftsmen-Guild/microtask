import { describe, expect, it } from 'vitest'
import { AppError, Conflict, Forbidden, Invalid, NotFound } from './errors.js'

describe('errors', () => {
  it.each([
    [new NotFound('gone'), 404, 'not_found'],
    [new Forbidden('nope'), 403, 'forbidden'],
    [new Invalid('bad'), 422, 'invalid'],
    [new Conflict('stale'), 409, 'conflict'],
  ])('maps %s to a status and a code', (error, status, code) => {
    expect(error.status).toBe(status)
    expect(error.code).toBe(code)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
  })

  it('keeps the message and a usable stack', () => {
    const error = new NotFound('Project not found')
    expect(error.message).toBe('Project not found')
    expect(error.stack).toContain('errors.test')
  })

  it('names itself after its class, so logs are readable', () => {
    expect(new Forbidden('x').name).toBe('Forbidden')
  })
})
