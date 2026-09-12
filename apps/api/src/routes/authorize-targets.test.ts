import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACTION_DECISIONS, type CapabilityAction } from '@repo/contracts'
import { ACTIONS } from '@repo/kernel'

const ROUTES = join(dirname(fileURLToPath(import.meta.url)), 'microtask')

const handlers = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return handlers(full)
    return entry.isFile() && entry.name === 'handlers.ts' ? [full] : []
  })

const sources = (): string => handlers(ROUTES).map((file) => readFileSync(file, 'utf8')).join('\n')

const GATE = /authorize\(\s*c,\s*(?:'([a-z:-]+)'|([A-Za-z]+)),\s*(?:\{\s*kind:\s*'([a-z]+)'|([A-Za-z]+))/gu

interface Gate {
  readonly action: string
  readonly target: string
}

const gates = (): readonly Gate[] =>
  [...sources().matchAll(GATE)].map((found) => ({
    action: found[1] ?? `<${found[2] ?? '?'}>`,
    target: found[3] ?? `<${found[4] ?? '?'}>`,
  }))

const isAction = (value: string): value is CapabilityAction => value in ACTION_DECISIONS

describe('the target column of ACTION_DECISIONS is the target the API actually gates on', () => {
  it('finds a gate for most of the action list, so the scan is not matching nothing', () => {
    expect(gates().length).toBeGreaterThan(20)
  })

  const declared = (gate: Gate): readonly string[] =>
    isAction(gate.action)
      ? [ACTION_DECISIONS[gate.action].target, ...(ACTION_DECISIONS[gate.action].alsoGatedOn ?? [])]
      : []

  it('agrees with every gate whose action and target are both literals', () => {
    const disagreed = gates()
      .filter((gate) => isAction(gate.action) && !gate.target.startsWith('<'))
      .filter((gate) => !declared(gate).includes(gate.target))
    expect(disagreed).toEqual([])
  })

  it('finds project:read gated twice, on the project and on its folder list (ADR 0011)', () => {
    const reads = gates().filter((gate) => gate.action === 'project:read')
    expect([...new Set(reads.map((gate) => gate.target))].sort()).toEqual(['folder', 'project'])
    expect(ACTION_DECISIONS['project:read'].alsoGatedOn).toEqual(['folder'])
  })

  it('names the two gates whose target is a variable, which are the two special cases', () => {
    const computed = gates().filter((gate) => gate.target.startsWith('<'))
    expect(computed).toEqual([
      { action: '<action>', target: '<target>' },
      { action: 'share:create', target: '<scope>' },
    ])
  })

  it('records share:create against the caller own scope, which is what that variable holds', () => {
    expect(ACTION_DECISIONS['share:create'].target).toBe('own-scope')
  })

  it('leaves only the actions with no route: workspace:import, workspace:search', () => {
    const gated = new Set(gates().map((gate) => gate.action))
    expect(ACTIONS.filter((action) => !gated.has(action))).toEqual([
      'workspace:import',
      'workspace:search',
    ])
  })
})
