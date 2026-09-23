import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  ADMIN_ONLY_ACTIONS,
  ROLES,
  TARGET_KINDS,
  can,
  type Action,
  type PlanScope,
  type Principal,
  type ProjectScope,
  type Role,
  type Scope,
  type Target,
} from '@repo/kernel'
import * as contracts from './index.js'
import {
  ACTION_DECISIONS,
  CAPABILITY_ACTIONS,
  capabilities,
  mayReach,
  type CapabilityTarget,
} from './capabilities.js'

/**
 * Derived from the kernel's own kinds so a new target kind enters this cross-product by itself.
 *
 * Hand-written, it did not: the kernel could gain a kind and every agreement test below would
 * keep passing without ever asking a question about it.
 */
const TARGETS: readonly CapabilityTarget[] = [...TARGET_KINDS, 'own-scope']

type KernelKind = (typeof TARGET_KINDS)[number]

type BeyondKernelKinds = Exclude<CapabilityTarget, KernelKind | 'own-scope'>

/**
 * Empty exactly while `CapabilityTarget` names nothing the kernel does not, plus `own-scope`.
 *
 * `Record<never, never>` is `{}`, so this compiles while the two agree and fails the moment the
 * hand-written union in `capabilities.ts` grows a member. The spread above covers the opposite
 * drift — a kernel kind missing from the union — so between them the two lists cannot part.
 */
const BEYOND_KERNEL_KINDS: Readonly<Record<BeyondKernelKinds, never>> = {}

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const PL = '01M240HZ6T4K9QW8N2RXY5BCDE'
const TOKEN = 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7'

const projectScope: ProjectScope = { kind: 'project', projectId: P }
const taskScope: ProjectScope = { kind: 'task', projectId: P, taskId: T }
const planScope: PlanScope = { kind: 'plan', planId: PL }

const SCOPES: readonly (readonly [string, Scope])[] = [
  ['project-scoped', projectScope],
  ['task-scoped', taskScope],
  ['plan-scoped', planScope],
]

const holder = (role: Role, scope: Scope): Principal => ({ kind: 'link', role, scope, token: TOKEN })

const taskOf = (scope: Scope): string => (scope.kind === 'task' ? scope.taskId : T)

const projectIdOf = (scope: Scope): string => (scope.kind === 'plan' ? P : scope.projectId)

const planIdOf = (scope: Scope): string => (scope.kind === 'plan' ? scope.planId : PL)

/**
 * One builder per kernel kind, so a tenth kind is a missing key rather than a tenth `if`.
 *
 * The chain this replaces sat at cyclomatic complexity 10, exactly on the lint cap, which made
 * the next target kind a lint failure in a file whose whole job is to absorb new kinds.
 */
const TARGET_BY_KIND: Readonly<Record<KernelKind, (scope: Scope) => Target>> = {
  workspace: () => ({ kind: 'workspace' }),
  project: (scope) => ({ kind: 'project', projectId: projectIdOf(scope) }),
  folder: (scope) => ({ kind: 'folder', projectId: projectIdOf(scope) }),
  task: (scope) => ({ kind: 'task', projectId: projectIdOf(scope), taskId: taskOf(scope) }),
  tab: (scope) => ({ kind: 'tab', projectId: projectIdOf(scope), taskId: taskOf(scope) }),
  plan: (scope) => ({ kind: 'plan', planId: planIdOf(scope) }),
  epic: (scope) => ({ kind: 'epic', planId: planIdOf(scope) }),
  feature: (scope) => ({ kind: 'feature', planId: planIdOf(scope) }),
  item: (scope) => ({ kind: 'item', planId: planIdOf(scope) }),
}

const targetIn = (scope: Scope, kind: CapabilityTarget): Target =>
  kind === 'own-scope' ? scope : TARGET_BY_KIND[kind](scope)

const kernelAnswer = (role: Role, scope: Scope, action: Action, target: CapabilityTarget): boolean =>
  can(holder(role, scope), action, targetIn(scope, target))

describe('capabilities answers for exactly the actions the kernel names (ADR 0038)', () => {
  it('names every kernel action and invents none, so a new one fails this test until projected', () => {
    expect([...CAPABILITY_ACTIONS].sort()).toEqual([...ACTIONS].sort())
  })

  it('returns a boolean for each of them and nothing else', () => {
    const answered = capabilities('manage', projectScope)
    expect(Object.keys(answered).sort()).toEqual([...ACTIONS].sort())
    expect(Object.values(answered).every((value) => typeof value === 'boolean')).toBe(true)
  })

  it('decides every action against a target, so no action is left without a question', () => {
    for (const action of ACTIONS) {
      expect(TARGETS).toContain(ACTION_DECISIONS[action].target)
    }
  })

  /**
   * Kept rather than deleted, and renamed to stop claiming otherwise: both assertions compare a
   * value to the definition three dozen lines above it and neither can fail. What earns the `it` is
   * `BEYOND_KERNEL_KINDS`, whose whole job is to be compiled — nothing else reads it, and an unused
   * const is a lint error, so deleting this would delete the guard along with the false claim.
   */
  it('restates the two type-level guards above it, which typecheck enforces and vitest cannot', () => {
    expect(TARGETS).toEqual([...TARGET_KINDS, 'own-scope'])
    expect(Object.keys(BEYOND_KERNEL_KINDS)).toEqual([])
  })

  it('answers each action against its own target, capabilities being the record over mayReach', () => {
    for (const role of ROLES) {
      for (const [, scope] of SCOPES) {
        const answered: Readonly<Record<string, boolean>> = capabilities(role, scope)
        for (const action of ACTIONS) {
          const target = ACTION_DECISIONS[action].target
          expect({ action, answer: answered[action] }).toEqual({
            action,
            answer: mayReach(role, scope, action, target),
          })
        }
      }
    }
  })
})

describe('capabilities agrees with can() for every role x scope x action triple', () => {
  for (const role of ROLES) {
    for (const [label, scope] of SCOPES) {
      it(`agrees for a ${label} ${role} link across every action and every target`, () => {
        const disagreed = ACTIONS.flatMap((action) =>
          TARGETS.filter(
            (target) =>
              mayReach(role, scope, action, target) !== kernelAnswer(role, scope, action, target),
          ).map((target) => `${action} on ${target}`),
        )
        expect(disagreed).toEqual([])
      })
    }
  }

  const shape = (role: Role, scope: Scope): string =>
    JSON.stringify(Object.values(capabilities(role, scope)))

  it('is not vacuous: scope changes the answer for write and for manage', () => {
    expect(shape('write', projectScope)).not.toBe(shape('write', taskScope))
    expect(shape('manage', projectScope)).not.toBe(shape('manage', taskScope))
  })

  it('is not vacuous: role changes the answer in every scope', () => {
    const distinct = SCOPES.map(([, scope]) => new Set(ROLES.map((role) => shape(role, scope))))
    expect(distinct.map((set) => set.size)).toEqual(SCOPES.map(() => ROLES.length))
  })

  it('answers a view link identically in both scopes, its two actions being all a task reaches', () => {
    expect(shape('view', projectScope)).toBe(shape('view', taskScope))
    const answered: Readonly<Record<string, boolean>> = capabilities('view', taskScope)
    expect(ACTIONS.filter((action) => answered[action])).toEqual(['project:read', 'task:read'])
  })

  it('refuses every admin-only action to every role in every scope', () => {
    for (const role of ROLES) {
      for (const [, scope] of SCOPES) {
        const answered: Readonly<Record<string, boolean>> = capabilities(role, scope)
        for (const action of ADMIN_ONLY_ACTIONS) expect(answered[action], action).toBe(false)
      }
    }
  })
})

describe('the trap this function exists to remove (ADR 0038)', () => {
  const taskManage = capabilities('manage', taskScope)

  it('lets a task-scoped manage holder mint a link, which gates on the new link own scope', () => {
    expect(taskManage['share:create']).toBe(true)
    expect(can(holder('manage', taskScope), 'share:create', taskScope)).toBe(true)
  })

  it('refuses it the list, the revoke and the rename, which all gate on a project target', () => {
    expect(taskManage['share:read']).toBe(false)
    expect(taskManage['share:revoke']).toBe(false)
    expect(taskManage['share:update']).toBe(false)
    const project: Target = { kind: 'project', projectId: P }
    for (const action of ['share:read', 'share:revoke', 'share:update'] as const) {
      expect(can(holder('manage', taskScope), action, project), action).toBe(false)
    }
  })

  it('renders no share manager from role alone: a project-scoped manage holder differs', () => {
    const projectManage = capabilities('manage', projectScope)
    expect(projectManage['share:read']).toBe(true)
    expect(projectManage['share:revoke']).toBe(true)
    expect(projectManage['share:update']).toBe(true)
  })

  it('leaves a task-scoped holder own minted link rename-able by nobody but a wider holder', () => {
    expect(taskManage['share:create']).toBe(true)
    expect(taskManage['share:update']).toBe(false)
    expect(capabilities('manage', projectScope)['share:update']).toBe(true)
  })

  it('refuses a task-scoped holder the folder tree and a sibling task, whatever its role', () => {
    expect(taskManage['folder:create']).toBe(false)
    expect(taskManage['folder:rename']).toBe(false)
    expect(taskManage['task:create']).toBe(false)
    expect(taskManage['task:reorder']).toBe(false)
  })

  it('still lets it read its project and write its own tabs', () => {
    expect(taskManage['project:read']).toBe(true)
    expect(taskManage['tab:write']).toBe(true)
    expect(taskManage['tab:delete']).toBe(true)
    expect(taskManage['project:rename']).toBe(false)
  })

  it('gives a view link no write of any kind', () => {
    const view = capabilities('view', projectScope)
    expect(view['tab:write']).toBe(false)
    expect(view['tab:create']).toBe(false)
    expect(view['task:rename']).toBe(false)
    expect(view['project:read']).toBe(true)
  })

  it('gives a write link tabs it may add and rename but not delete or reorder', () => {
    const write = capabilities('write', projectScope)
    expect(write['tab:create']).toBe(true)
    expect(write['tab:rename']).toBe(true)
    expect(write['tab:delete']).toBe(false)
    expect(write['tab:reorder']).toBe(false)
  })
})

describe('@repo/kernel is a dev-time dependency and nothing more (ADR 0038)', () => {
  const manifest = (): Record<string, Record<string, string>> =>
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<
      string,
      Record<string, string>
    >

  it('is absent from dependencies, because a runtime edge puts node:crypto in a browser bundle', () => {
    expect(Object.keys(manifest()['dependencies'] ?? {})).toEqual(['zod'])
  })

  it('is present in devDependencies, which is what lets the agreement test compare the two', () => {
    expect(manifest()['devDependencies']?.['@repo/kernel']).toBe('workspace:*')
  })
})

describe('capabilities is reachable from the barrel, an app importing nothing else', () => {
  it('exports the function', () => {
    expect(contracts.capabilities).toBe(capabilities)
  })
})

describe('the projection answers about the caller own project and no other', () => {
  const OTHER = '01M240GQ7Z8XKJWR3Y5NBDT2VC'

  it('has no id to compare, so a target elsewhere is a question it cannot be asked', () => {
    expect(mayReach('manage', projectScope, 'folder:create', 'folder')).toBe(true)
    expect(can(holder('manage', projectScope), 'folder:create', { kind: 'folder', projectId: P })).toBe(true)
    expect(
      can(holder('manage', projectScope), 'folder:create', { kind: 'folder', projectId: OTHER }),
    ).toBe(false)
  })

  it('takes the project from the scope, so two scopes over two projects answer alike', () => {
    const elsewhere: Scope = { kind: 'project', projectId: OTHER }
    expect(JSON.stringify(capabilities('manage', elsewhere))).toBe(
      JSON.stringify(capabilities('manage', projectScope)),
    )
  })
})

describe('the actions the API gates on two targets', () => {
  it('names all four, so an action gaining a second target cannot arrive unrecorded', () => {
    const doubled = CAPABILITY_ACTIONS.filter(
      (action) => (ACTION_DECISIONS[action].alsoGatedOn ?? []).length > 0,
    )
    expect(doubled).toEqual(['project:read', 'share:read', 'share:revoke', 'share:update'])
  })

  describe('project:read, gated a second time on the folder list a task scope is refused (ADR 0011)', () => {
    it('records the second target rather than leaving it unsaid', () => {
      expect(ACTION_DECISIONS['project:read'].alsoGatedOn).toEqual(['folder'])
    })

    it('tells a task-scoped holder it may read its project and not its folder list', () => {
      expect(mayReach('view', taskScope, 'project:read', 'project')).toBe(true)
      expect(mayReach('manage', taskScope, 'project:read', 'folder')).toBe(false)
      expect(
        can(holder('manage', taskScope), 'project:read', { kind: 'folder', projectId: P }),
      ).toBe(false)
    })

    it('tells a project-scoped holder it may read both, so the distinction is scope and not role', () => {
      expect(mayReach('view', projectScope, 'project:read', 'project')).toBe(true)
      expect(mayReach('view', projectScope, 'project:read', 'folder')).toBe(true)
    })
  })

  describe('the three seat actions, gated a second time on the plan whose seats they administer', () => {
    it('records the plan on each of the three rather than leaving it unsaid', () => {
      expect(ACTION_DECISIONS['share:revoke'].alsoGatedOn).toEqual(['plan'])
      expect(ACTION_DECISIONS['share:update'].alsoGatedOn).toEqual(['plan'])
      expect(ACTION_DECISIONS['share:read'].alsoGatedOn).toEqual(['plan'])
    })

    it('clears a plan manage seat on that second target and refuses it the first, the row naming one', () => {
      for (const action of ['share:read', 'share:revoke', 'share:update'] as const) {
        expect(mayReach('manage', planScope, action, 'plan')).toBe(true)
        expect(mayReach('manage', planScope, action, 'project')).toBe(false)
        expect(capabilities('manage', planScope)[action]).toBe(false)
      }
    })

    it('agrees with the server about a plan manage seat reading seats, which no route scan can check', () => {
      expect(mayReach('manage', planScope, 'share:read', 'plan')).toBe(true)
      expect(can(holder('manage', planScope), 'share:read', { kind: 'plan', planId: PL })).toBe(true)
      expect(mayReach('view', planScope, 'share:read', 'plan')).toBe(false)
      expect(mayReach('write', planScope, 'share:read', 'plan')).toBe(false)
    })

    it('refuses a plan view seat that same second target, so the pair is manage and not scope', () => {
      expect(mayReach('view', planScope, 'share:revoke', 'plan')).toBe(false)
      expect(mayReach('write', planScope, 'share:update', 'plan')).toBe(false)
    })
  })
})
