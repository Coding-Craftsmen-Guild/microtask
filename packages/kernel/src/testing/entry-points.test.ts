import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as main from '../index.js'
import * as testing from './index.js'

interface Manifest {
  exports: Record<string, { types: string; default: string }>
}

const manifest = async (): Promise<Manifest> =>
  JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as Manifest

describe('@repo/kernel entry points', () => {
  it('keeps the in-memory FileSystem and its contract harness out of the main entry, so no production import can reach a fake', async () => {
    expect(Object.keys(main)).toContain('can')
    expect(Object.keys(main)).not.toContain('MemoryFileSystem')
    expect(Object.keys(main)).not.toContain('describeFileSystem')
  })

  it('serves both from the testing entry instead', () => {
    expect(Object.keys(testing)).toEqual(
      expect.arrayContaining(['MemoryFileSystem', 'describeFileSystem']),
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
