import type { Project } from '@repo/api-client'
import type { ProgressValue } from '@repo/contracts'
import type { ScopeChoice } from '../share-manager/types'
import type { RowFolder, RowTask } from '../task-tree/types'
import { inTreeOrder, progressOf } from './summary'

/**
 * Everything the project page hands its components — and **no share token**.
 *
 * `projects.read()` answers an admin with every link and its token, because the API's view is the
 * one place that decides who may see them (ADR 0013). The page needs none of them: it shows a
 * count, and the dialog that shows links asks for them when it opens. Anything passed from a
 * Server Component to a client component is serialised into the Flight payload and lands in the
 * HTML, so the tokens stop here, on the server, and every field below is copied by name rather
 * than spread from the view (ADR 0033).
 */
export interface ProjectPageModel {
  /** The project's id. */
  readonly id: string
  /** Its name. */
  readonly name: string
  /** Its folders. */
  readonly folders: readonly RowFolder[]
  /** Its task entries. */
  readonly tasks: readonly RowTask[]
  /** How many share links it has, or `undefined` when the caller was not shown them. */
  readonly shareLinkCount: number | undefined
  /** Task-scoped links per task id, or `undefined` when the caller was not shown them. */
  readonly linkCounts: Readonly<Record<string, number>> | undefined
  /** The scopes a new link may be minted over: tasks in tree order, then the whole project. */
  readonly choices: readonly ScopeChoice[]
  /** Every folder and task a project-scoped link would open. */
  readonly exposure: string
  /** The sum of the tasks' cached progress. */
  readonly progress: ProgressValue
}

const countsByTask = (links: NonNullable<Project['shareLinks']>): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const link of links) {
    if (link.scope.kind === 'task') counts[link.scope.taskId] = (counts[link.scope.taskId] ?? 0) + 1
  }
  return counts
}

/** What minting a project-scoped link would expose, named folder by folder and task by task (ADR 0011). */
export function exposureOf(project: Pick<Project, 'folders' | 'tasks'>): string {
  const named = (names: readonly string[]) => (names.length === 0 ? 'none' : names.join(', '))
  const folders = [...project.folders].sort((a, b) => a.position - b.position).map((one) => one.name)
  const tasks = inTreeOrder(project.folders, project.tasks).map((one) => one.name)
  return `This link opens everything in this project, including anything added later. Folders: ${named(folders)}. Tasks: ${named(tasks)}.`
}

/** Reduces the admin's view of a project to what its page may carry. */
export function projectPageModel(project: Project): ProjectPageModel {
  const tasks = inTreeOrder(project.folders, project.tasks).map((task) => ({
    id: task.id,
    name: task.name,
    folderId: task.folderId,
    position: task.position,
    progress: task.progress,
    updatedAt: task.updatedAt,
    tabCount: task.tabCount,
    tabNames: task.tabNames,
  }))
  const choices: ScopeChoice[] = [
    ...tasks.map((task) => ({ value: task.id, label: task.name, scope: { kind: 'task' as const, projectId: project.id, taskId: task.id } })),
    { value: 'project', label: 'Whole project', scope: { kind: 'project', projectId: project.id } },
  ]
  return {
    id: project.id,
    name: project.name,
    folders: project.folders.map((folder) => ({ id: folder.id, name: folder.name, position: folder.position })),
    tasks,
    shareLinkCount: project.shareLinks?.length,
    linkCounts: project.shareLinks === undefined ? undefined : countsByTask(project.shareLinks),
    choices,
    exposure: exposureOf(project),
    progress: progressOf(tasks),
  }
}
