import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import config from './next.config'

const HERE = resolve(process.cwd())

describe('the build this app deploys as (ADR 0026)', () => {
  it('builds standalone, which is what makes the runner image node_modules-free', () => {
    expect(config.output).toBe('standalone')
  })

  it('traces from the repository root, not this directory, so workspace packages are copied', () => {
    expect(config.outputFileTracingRoot).toBe(resolve(HERE, '..', '..'))
    expect(config.outputFileTracingRoot).not.toBe(HERE)
  })
})

describe('the headers this app does not set', () => {
  it('declares no header rule at all, because it has no surface whose URL is a credential', async () => {
    expect(await config.headers?.()).toBeUndefined()
  })
})
