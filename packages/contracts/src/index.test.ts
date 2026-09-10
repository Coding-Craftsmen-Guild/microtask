import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as contracts from './index.js'

const schemas = Object.entries<unknown>(contracts).filter(
  (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
)

describe('contracts', () => {
  it('exports at least one schema', () => {
    expect(schemas.length).toBeGreaterThan(0)
  })

  it('gives every exported schema a component id', () => {
    const missing = schemas.filter(([, schema]) => !schema.meta()?.id).map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('never reuses a component id', () => {
    const ids = schemas.map(([, schema]) => schema.meta()?.id).filter(Boolean)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(duplicates).toEqual([])
  })

  it('accepts a valid project manifest', () => {
    const parsed = contracts.ProjectManifest.safeParse({
      id: '01M240ERCRWWCN16Q5AHP1FZAQ',
      name: 'Launch',
      folders: [],
      tasks: [],
      shareLinks: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(contracts.EntityName.safeParse('x'.repeat(81)).success).toBe(false)
    expect(contracts.EntityName.safeParse('x'.repeat(80)).success).toBe(true)
  })

  it('rejects a document that is not a doc node', () => {
    expect(contracts.DocumentJson.safeParse({ type: 'paragraph' }).success).toBe(false)
    expect(contracts.DocumentJson.safeParse({ type: 'doc', content: [] }).success).toBe(true)
  })

  it('rejects an id that is not a ULID', () => {
    expect(contracts.EntityId.safeParse('../../etc/passwd').success).toBe(false)
  })
})
