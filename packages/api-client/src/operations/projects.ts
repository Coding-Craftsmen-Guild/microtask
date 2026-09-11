import { ProjectList, ProjectView } from '@repo/contracts'
import { PROJECTS_PATH, projectPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

/** One project as the API shapes it for whoever asked, with blocks that caller is refused absent. */
export type Project = Decoded<typeof ProjectView>

/** Everything a caller may ask of a project. Which of them succeed is the API's decision. */
export interface ProjectsApi {
  /** Lists every project the caller may be told about. `workspace:list-projects` is admin-only. */
  list(): Promise<Decoded<typeof ProjectList>>

  /** Creates an empty project. */
  create(name: string): Promise<Project>

  /** Reads one project, already shaped for this caller. */
  read(projectId: string): Promise<Project>

  /** Renames one project, leaving its folders, tasks and links alone. */
  rename(projectId: string, name: string): Promise<Project>

  /** Removes one project, its tasks and its share links. */
  remove(projectId: string): Promise<void>
}

/** Binds the project operations to a transport. */
export function projectsApi(transport: Transport): ProjectsApi {
  return {
    list: () => transport.json({ method: 'GET', path: PROJECTS_PATH }, ProjectList),
    create: (name) =>
      transport.json({ method: 'POST', path: PROJECTS_PATH, body: { name } }, ProjectView),
    read: (projectId) =>
      transport.json({ method: 'GET', path: projectPath(projectId) }, ProjectView),
    rename: (projectId, name) =>
      transport.json(
        { method: 'PATCH', path: projectPath(projectId), body: { name } },
        ProjectView,
      ),
    remove: (projectId) => transport.empty({ method: 'DELETE', path: projectPath(projectId) }),
  }
}
