import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as main from '../index.js'
import * as testing from './index.js'

interface Manifest {
  exports: Record<string, { types: string; default: string }>
}

const manifest = async (): Promise<Manifest> =>
  JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as Manifest

describe('@repo/schedule entry points', () => {
  it('keeps the plan generator out of the main entry, so no browser bundle can pull it in', () => {
    expect(Object.keys(main)).toContain('schedule')
    expect(Object.keys(main)).toContain('railsOf')
    expect(Object.keys(main)).toContain('itemsByFeature')
    expect(Object.keys(main)).not.toContain('arbitraryPlan')
    expect(Object.keys(main)).not.toContain('randomSource')
  })

  it('serves the generator and its seeded source from the testing entry instead', () => {
    expect(Object.keys(testing)).toEqual(
      expect.arrayContaining(['arbitraryPlan', 'randomSource']),
    )
  })

  it('declares ./testing in the exports map, pointing at the paths the build emits', async () => {
    const { exports } = await manifest()
    expect(exports['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' })
    expect(exports['./testing']).toEqual({
      types: './dist/testing/index.d.ts',
      default: './dist/testing/index.js',
    })
  })
})
