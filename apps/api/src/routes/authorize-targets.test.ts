import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACTION_DECISIONS, type CapabilityAction } from '@repo/contracts'
import { ACTIONS, type Action } from '@repo/kernel'

/**
 * The Macroplan actions the kernel declares before any route exists to reach them.
 *
 * Task 2 widened `ACTIONS` with twenty-four of these; the routes that gate them land in Tasks 15 and
 * 16, and each of those empties its own rows out of this set. Task 15 struck off the six the
 * plan routes gate — the two workspace collections and the four `plan:` actions. Task 16 struck off
 * the sixteen its epic, feature and item routes gate, which is every remaining action a phase-1
 * route can reach.
 *
 * The two left are the bridge, and **no phase-1 route gates either**: `epic:bind` writes an epic's
 * binding and `item:link` writes an item's `linkedTaskId`, both of which spec §9 reserves for phase
 * 4 — `UpdateEpicPayload` and `UpdateItemPayload` do not even declare those fields, and Task 16's
 * suites assert the stored values stay `null` after a body that names one. So this set does not
 * become empty at the end of Task 16b: it holds these two until the bridge is built.
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
const PENDING_ROUTES: ReadonlySet<Action> = new Set([])

const ROUTES = dirname(fileURLToPath(import.meta.url))

const handlers = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return handlers(full)
    // Any *handlers.ts and not only the exact name: phase 4 split the item routes' bridge handlers
    // into `link-handlers.ts` because `handlers.ts` was at ADR 0027's line cap, and a scan keyed to
    // the exact filename would have stopped seeing three gated routes without failing — which is the
    // one thing this file exists to prevent. A subtree that outgrows one handlers file must stay
    // visible to the sweep rather than fall out of it.
    return entry.isFile() && entry.name.endsWith('handlers.ts') ? [full] : []
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

  it('names the three gates whose target is a variable, which are the special cases', () => {
    const computed = gates().filter((gate) => gate.target.startsWith('<'))
    expect(computed).toEqual([
      { action: 'share:create', target: '<scope>' },
      { action: '<action>', target: '<target>' },
      { action: 'share:create', target: '<scope>' },
    ])
  })

  it('records share:create against the caller own scope, which is what that variable holds', () => {
    expect(ACTION_DECISIONS['share:create'].target).toBe('own-scope')
  })

  it('finds one minting gate per product, both passing the scope being minted rather than a kind', () => {
    const minting = gates().filter((gate) => gate.action === 'share:create')
    expect(minting.map((gate) => gate.target)).toEqual(['<scope>', '<scope>'])
  })

  it('finds the two seat actions gated on a plan, which is the target their rows also record', () => {
    for (const action of ['share:update', 'share:revoke'] as const) {
      const targets = gates().filter((gate) => gate.action === action).map((gate) => gate.target)
      expect([action, [...targets].sort()]).toEqual([action, ['plan', 'project']])
      expect(ACTION_DECISIONS[action].alsoGatedOn).toEqual(['plan'])
    }
  })

  it('leaves only the action whose gate names no literal to read: workspace:search', () => {
    const gated = new Set(gates().map((gate) => gate.action))
    expect(
      ACTIONS.filter((action) => !gated.has(action) && !PENDING_ROUTES.has(action)),
    ).toEqual(['workspace:search'])
  })

  it('finds no pending row that has since been gated, so the set cannot outlive its debt', () => {
    const gated = new Set(gates().map((gate) => gate.action))
    expect([...PENDING_ROUTES].filter((action) => gated.has(action))).toEqual([])
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
