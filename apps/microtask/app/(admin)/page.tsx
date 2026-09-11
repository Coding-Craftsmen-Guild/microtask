import type { Metadata } from 'next'
import { createProject, deleteProject } from '../../actions/projects'
import { CreateProject } from '../../components/projects/create-project'
import { loadProjects } from '../../components/projects/load'
import { ProjectList } from '../../components/projects/project-list'

/** The tab title the app being replaced gave this page. */
export const metadata = { title: 'Projects · CC Guild Microtask' } satisfies Metadata

/**
 * `/`: the projects index — create, list, open, delete.
 *
 * It reads `projects.list()` and nothing else, which carries a count where the share links were,
 * so no token can reach this page's HTML however it is composed (ADR 0033). A load failure is
 * said in place of the list rather than only toasted as it was, and the create form stays usable
 * above it.
 */
export default async function ProjectsPage() {
  const loaded = await loadProjects()
  return (
    <div className="grid gap-4 pt-6">
      <CreateProject onCreate={createProject} />
      {loaded.ok ? (
        <ProjectList now={Date.now()} onDelete={deleteProject} projects={loaded.value} />
      ) : (
        <p className="text-center text-muted-foreground" role="alert">
          {loaded.detail}
        </p>
      )}
    </div>
  )
}
