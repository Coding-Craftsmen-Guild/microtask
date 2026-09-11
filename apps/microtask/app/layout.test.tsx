import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { metadata } from './layout'

const here = dirname(fileURLToPath(import.meta.url))

describe('the document shell', () => {
  it('names the CC Guild logo as every page’s icon, as the app being replaced did', () => {
    expect(metadata.icons).toEqual({ icon: '/img/logo.webp' })
  })

  it('serves that icon from this app’s own public directory', () => {
    expect(existsSync(join(here, '..', 'public', 'img', 'logo.webp'))).toBe(true)
  })
})
