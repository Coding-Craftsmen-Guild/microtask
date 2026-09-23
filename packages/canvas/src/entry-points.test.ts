import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as main from './index.js'

interface Manifest {
  exports: Record<string, { types: string; default: string }>
}

const manifest = async (): Promise<Manifest> =>
  JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest

describe('@repo/canvas entry points', () => {
  it('declares only "." in the exports map, so a deep import cannot become the convention', async () => {
    const { exports } = await manifest()
    expect(Object.keys(exports)).toEqual(['.'])
    expect(exports['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' })
  })

  it('ships the scale and the rails, and nothing a later geometry module has not landed yet', () => {
    expect(Object.keys(main).sort()).toEqual([
      'dayToX',
      'railLayout',
      'scaleFor',
      'widthOfDays',
      'xToDay',
    ])
  })

  it('keeps the span lookup off the barrel, so two modules share one map instead of exporting it', () => {
    expect(Object.keys(main)).not.toContain('spansById')
  })
})
