import { describe, expect, it } from 'vitest'
import { isShareToken, isUlid } from '@repo/kernel'
import { LIMITS } from '../limits.js'
import { fixedClock, sequentialIds } from './doubles.js'

describe('fixedClock', () => {
  it('returns the instant it was given, so tests are deterministic', () => {
    expect(fixedClock('2026-09-10T00:00:00.000Z').now()).toBe('2026-09-10T00:00:00.000Z')
  })
})

describe('sequentialIds', () => {
  it('produces distinct ULID-shaped ids', () => {
    const ids = sequentialIds()
    const a = ids.entityId()
    const b = ids.entityId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('produces ids paths.ts accepts, so a service test fails in the service and not in storage', () => {
    const ids = sequentialIds()
    const sample = Array.from({ length: LIMITS.projectsPerProduct }, () => ids.entityId())
    expect(sample.filter((id) => !isUlid(id))).toEqual([])
    expect(new Set(sample).size).toBe(sample.length)
  })

  it('produces distinct share tokens', () => {
    const ids = sequentialIds()
    expect(ids.token()).not.toBe(ids.token())
  })

  it('produces tokens isShareToken accepts, so a share-link test reaches the domain', () => {
    expect(isShareToken(sequentialIds().token())).toBe(true)
  })

  it('is reproducible from the same seed, so a failing test can be replayed', () => {
    expect(sequentialIds(7).entityId()).toBe(sequentialIds(7).entityId())
  })
})
