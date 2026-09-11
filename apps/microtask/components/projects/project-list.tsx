import { EmptyState } from '@repo/ui/shell/empty-state'
import type { ActionResult } from '../../actions/result'
import { ProjectRow, type IndexedProject } from './project-row'

/** Props for {@link ProjectList}. */
export interface ProjectListProps {
  /** Every project, in the order the API sent: most recently updated first. */
  projects: readonly IndexedProject[]
  /** The instant the page was rendered. */
  now: number
  /** Deletes a project. */
  onDelete: (projectId: string) => Promise<ActionResult<null>>
}

/** The projects index: one row each, or legacy's empty state verbatim. */
export function ProjectList({ projects, now, onDelete }: ProjectListProps) {
  if (projects.length === 0) return <EmptyState>No projects yet — create your first one above.</EmptyState>
  return (
    <div className="grid gap-2.5">
      {projects.map((project) => (
        <ProjectRow key={project.id} now={now} onDelete={onDelete} project={project} />
      ))}
    </div>
  )
}
