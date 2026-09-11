'use client'

import { Button } from '@repo/ui/components/button'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useState } from 'react'
import type { ActionResult } from '../../actions/result'

/** Props for {@link DeleteProject}. */
export interface DeleteProjectProps {
  /** The project to delete. */
  projectId: string
  /** Its name, quoted in the question. */
  name: string
  /** Deletes it. Authority is the action's to re-derive, never this component's to assert. */
  onDelete: (projectId: string) => Promise<ActionResult<null>>
}

/** What a project delete takes with it, said before it is chosen. */
export const DELETE_PROJECT_MESSAGE =
  'All of its folders, tasks, tabs, content and share links are deleted. This cannot be undone.'

/**
 * The red Delete on a projects-index row, behind a confirm that names the project.
 *
 * The confirm is the destructive kind, which focuses nothing that confirms, so Enter cannot
 * delete — only a click can. Legacy's message listed tabs, content and share links; a project is
 * now a level above what it called a project, so folders and tasks go too and are named.
 */
export function DeleteProject({ projectId, name, onDelete }: DeleteProjectProps) {
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState('')
  const confirmed = async () => {
    setAsking(false)
    const result = await onDelete(projectId)
    setProblem(result.ok ? '' : result.detail)
  }
  return (
    <>
      <Button onClick={() => setAsking(true)} size="sm" title="Delete project" type="button" variant="destructive">
        Delete
      </Button>
      {problem !== '' ? <span className="text-[12.5px] text-destructive" role="alert">{problem}</span> : null}
      <ConfirmDialog
        confirmLabel="Delete project"
        danger
        message={DELETE_PROJECT_MESSAGE}
        onCancel={() => setAsking(false)}
        onConfirm={() => void confirmed()}
        open={asking}
        title={`Delete “${name}”?`}
      />
    </>
  )
}
