'use client'

import type { ActionResult } from '../../actions/result'
import { InlineName } from '../task-tree/inline-name'

/** Props for {@link ProjectTitle}. */
export interface ProjectTitleProps {
  /** The project. */
  projectId: string
  /** Its stored name. */
  name: string
  /** Whether renaming is drawn — `project:rename`, never a role. */
  editable: boolean
  /** Renames it, answering the stored name. */
  onRename: (projectId: string, name: string) => Promise<ActionResult<string>>
}

/**
 * The project's name as its page heading, edited in place exactly as legacy's title was: Enter
 * commits, Escape reverts, an empty or unchanged value restores with no request, and nothing
 * overwrites the field while it has focus.
 */
export function ProjectTitle({ projectId, name, editable, onRename }: ProjectTitleProps) {
  return (
    <h1 className="flex min-w-0 flex-1 text-2xl font-bold">
      {editable ? (
        <InlineName label="Project name" name={name} onRename={(next) => onRename(projectId, next)} />
      ) : (
        name
      )}
    </h1>
  )
}
