import type { ProjectScopeValue } from '@repo/contracts'
import type { ScopeChoice } from './types'

/**
 * Whether a link is scoped to exactly this task: the links a task page's share manager counts
 * and lists.
 *
 * A project-scoped link opens the task too, and is deliberately not among them. It is managed on
 * the project page, where the count beside Share and each task row's count already draw the same
 * line, so the number beside Share on a task page is the number on that task's row.
 */
export const scopedToTask = (scope: ProjectScopeValue, taskId: string): boolean =>
  scope.kind === 'task' && scope.taskId === taskId

/**
 * What a task page offers to mint over: that task, and nothing wider.
 *
 * The whole project is offered on the project page only, behind the confirm that lists what it
 * would open (ADR 0011); a project-scoped link minted here would not even be listed here. So a
 * holder who may mint only over its own task — a task-scoped `manage` link — is never offered a
 * scope the API would refuse (ADR 0038).
 */
export const taskChoices = (projectId: string, task: { readonly id: string; readonly name: string }): readonly ScopeChoice[] => [
  { value: task.id, label: task.name, scope: { kind: 'task', projectId, taskId: task.id } },
]

/**
 * What a project page offers to mint over: each task, in the order the caller drew them, then the
 * whole project — the admin's project page and a project-scoped `manage` link's list alike.
 *
 * `Whole project` comes last and is minted only behind the confirm that names everything it would
 * open (ADR 0011); the choices themselves are the same on both surfaces, because the same link
 * minted from either is the same link.
 */
export const projectChoices = (
  projectId: string,
  tasks: readonly { readonly id: string; readonly name: string }[],
): readonly ScopeChoice[] => [
  ...tasks.flatMap((task) => taskChoices(projectId, task)),
  { value: 'project', label: 'Whole project', scope: { kind: 'project', projectId } },
]
