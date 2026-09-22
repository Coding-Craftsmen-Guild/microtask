import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACTION_DECISIONS, type CapabilityAction } from '@repo/contracts'
import { ACTIONS, type Action } from '@repo/kernel'

/**
 * The Macroplan actions the kernel declares before any route exists to reach them.
 *
 * Task 2 widened `ACTIONS` with these twenty-four; the routes that gate them land in Tasks 15, 16
 * and 16b, and each of those empties its own rows out of this set. Task 17 asserts the set is
 * empty, which is what stops it outliving the debt it records — a pending list is visible and
 * self-clearing where a deleted assertion would be permanent and silent.
 *
 * Written out one by one rather than matched by prefix: a `plan:`/`epic:`/`feature:`/`item:` rule
 * would silently swallow the next Macroplan action somebody adds without a route, and the whole
 * value of this list is that adding one fails here until it is either gated or named.
 *
 * It is not a hole for the product it was not written for. The assertion below subtracts this set
 * and nothing else, so a **Microtask** action losing its gate still fails; and an action named
 * here that has since acquired a gate fails too, rather than sitting on the list forever.
 *
 * That self-clearing holds only for a gate whose action is a **literal**. The scan records a
 * variable gate as `<action>`, not as the action it resolves to, so a Macroplan handler that
 * passes its action through a variable leaves its row here green and unremoved. Gate the new
 * routes on literals, or remove their rows by hand when you do not.
 */
const PENDING_ROUTES: ReadonlySet<Action> = new Set([
  'plan:read',
  'plan:rename',
  'plan:retime',
  'plan:delete',
  'epic:create',
  'epic:rename',
  'epic:delete',
  'epic:reorder',
  'epic:bind',
  'feature:create',
  'feature:rename',
  'feature:estimate',
  'feature:delete',
  'feature:place',
  'feature:depend',
  'item:create',
  'item:rename',
  'item:estimate',
  'item:describe',
  'item:delete',
  'item:place',
  'item:link',
  'workspace:list-plans',
  'workspace:create-plan',
])

const ROUTES = dirname(fileURLToPath(import.meta.url))

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

  it('leaves only the action whose gate names no literal to read: workspace:search', () => {
    const gated = new Set(gates().map((gate) => gate.action))
    expect([...PENDING_ROUTES].filter((action) => gated.has(action))).toEqual([])
    expect(
      ACTIONS.filter((action) => !gated.has(action) && !PENDING_ROUTES.has(action)),
    ).toEqual(['workspace:search'])
  })

  it('finds workspace:import gated on the workspace, which is the target its row records', () => {
    const imports = gates().filter((gate) => gate.action === 'workspace:import')
    expect(imports.map((gate) => gate.target)).toEqual([
      'workspace',
      'workspace',
      'workspace',
      'workspace',
      'workspace',
    ])
    expect(ACTION_DECISIONS['workspace:import'].target).toBe('workspace')
  })
})
