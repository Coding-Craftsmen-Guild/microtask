import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Invalid } from '../errors.js'
import { contained } from './contained.js'

const PARENT = path.resolve('/data/microtask/projects')

describe('contained', () => {
  it('returns the resolved path when the target sits inside the parent', () => {
    expect(contained(PARENT, path.join(PARENT, 'child'))).toBe(path.join(PARENT, 'child'))
  })

  it('rejects a target that climbs out of the parent with .., which is what the guard exists for', () => {
    expect(() => contained(PARENT, path.join(PARENT, '..', '..', 'secret'))).toThrow(Invalid)
  })

  it('rejects a target resolving to the parent itself, because no legitimate builder produces one', () => {
    expect(() => contained(PARENT, path.join(PARENT, 'child', '..'))).toThrow(Invalid)
    expect(() => contained(PARENT, PARENT)).toThrow(Invalid)
  })

  it('rejects an absolute target somewhere else entirely', () => {
    expect(() => contained(PARENT, path.resolve('/etc/passwd'))).toThrow(Invalid)
  })

  it('rejects a sibling directory whose name merely starts with the parent name', () => {
    expect(() => contained(PARENT, `${PARENT}-other/child`)).toThrow(Invalid)
  })
})
