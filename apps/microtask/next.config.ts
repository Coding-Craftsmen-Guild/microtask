import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(here, '..', '..'),
}

export default config
