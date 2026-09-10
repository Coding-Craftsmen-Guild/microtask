import { can, type Action, type Principal, type Target } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'

/**
 * One name a search matched, and enough of an address to fetch what it named.
 *
 * A result carries no parent and no breadcrumb. That is the shape rather than an omission: the
 * name of the folder holding a task is itself a disclosure a task-scoped link must not receive
 * (ADR 0011), so a task result never names its folder and every principal is handed the same
 * fields. A widening therefore cannot arrive as an extra field nobody thought to filter.
 */
export type SearchResult =
  | { readonly kind: 'project'; readonly projectId: string; readonly name: string }
  | {
      readonly kind: 'folder'
      readonly projectId: string
      readonly folderId: string
      readonly name: string
    }
  | {
      readonly kind: 'task'
      readonly projectId: string
      readonly taskId: string
      readonly name: string
    }

/**
 * Reduces a query to the term matching compares, or to the empty string when it holds none.
 *
 * An empty term is the caller asking nothing, and an empty term is also a substring of every
 * name, so the two have to be told apart before matching rather than inside it.
 */
export function normalise(query: string): string {
  return query.trim().toLowerCase()
}

/** Whether a name holds the term anywhere in it, disregarding case. */
export function matches(name: string, needle: string): boolean {
  return name.toLowerCase().includes(needle)
}

/**
 * Every name in one manifest that a search could match, as results.
 *
 * The manifest is the whole source: a project's name, its folder names and its task names all
 * live here, and nothing else is a name (ADR 0005). Tab names live in the task files, which is
 * why they are not searched — reading them would cost one file per task per query and undo the
 * split that makes cross-project search one read per project (ADR 0021).
 */
export function candidates(manifest: ProjectManifest): readonly SearchResult[] {
  return [
    { kind: 'project', projectId: manifest.id, name: manifest.name },
    ...manifest.folders.map(
      (each): SearchResult => ({
        kind: 'folder',
        projectId: manifest.id,
        folderId: each.id,
        name: each.name,
      }),
    ),
    ...manifest.tasks.map(
      (each): SearchResult => ({
        kind: 'task',
        projectId: manifest.id,
        taskId: each.id,
        name: each.name,
      }),
    ),
  ]
}

/** The question a candidate is put to the policy as. */
export interface Clearance {
  readonly action: Action
  readonly target: Target
}

/**
 * The action and target a result is cleared against, so the policy decides and nothing here does.
 *
 * A folder is asked about as `project:read` on a `folder` target, because the policy has no
 * `folder:read` and the folder target is exactly what a task scope refuses outright — which is
 * what ADR 0011 names as the reason a task-scoped link cannot render a breadcrumb. A project is
 * the same action against a `project` target, which a task scope does reach.
 */
export function clearance(result: SearchResult): Clearance {
  if (result.kind === 'task') {
    return {
      action: 'task:read',
      target: { kind: 'task', projectId: result.projectId, taskId: result.taskId },
    }
  }
  if (result.kind === 'folder') {
    return { action: 'project:read', target: { kind: 'folder', projectId: result.projectId } }
  }
  return { action: 'project:read', target: { kind: 'project', projectId: result.projectId } }
}

/**
 * Whether this principal may be told this name.
 *
 * Asks `can()` once per candidate rather than restating scope containment: `withinTaskScope` and
 * `inScope` are private to the policy on purpose, and a second copy of a security predicate is
 * the failure this avoids. Shaping a collection is a filter and not a gate, so calling `can()`
 * here is what ADR 0009 asks for — the API's one `authorize()` still owns the gate.
 */
export function visibleTo(principal: Principal, result: SearchResult): boolean {
  const { action, target } = clearance(result)
  return can(principal, action, target)
}
