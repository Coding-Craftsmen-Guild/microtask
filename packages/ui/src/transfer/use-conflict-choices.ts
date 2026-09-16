'use client'

import { useCallback, useMemo, useState } from 'react'
import type { ConflictChoice, ProjectChoice } from './vocabulary'

/** The conflict choices in force, and the one way to change them. */
export interface ConflictChoices {
  /** The choice now in force for a project. */
  choiceFor: (projectId: string) => ConflictChoice
  /** Records a choice for one project, replacing whatever was in force. */
  choose: (projectId: string, choice: ConflictChoice) => void
  /** Every colliding project and its choice, shaped as the confirm request's list. */
  chosen: readonly ProjectChoice[]
}

/**
 * Holds one conflict choice per colliding project, defaulting every one of them to `skip`.
 *
 * `skip` is the default because it is the only one of the three that neither destroys a project
 * on disk nor remints a live client's URL, so an admin who confirms without reading the conflict
 * section loses nothing. It is a default and not a placeholder: a confirm must carry a choice for
 * every project the preview flagged, so `chosen` names all of them from the first render rather
 * than only the ones that were clicked.
 *
 * @param projectIds - The colliding projects, as the preview flagged them.
 * @returns The choices in force and the setter.
 */
export function useConflictChoices(projectIds: readonly string[]): ConflictChoices {
  const [made, setMade] = useState<Readonly<Record<string, ConflictChoice>>>({})
  const choiceFor = useCallback((projectId: string) => made[projectId] ?? 'skip', [made])
  const choose = useCallback((projectId: string, choice: ConflictChoice) => {
    setMade((current) => ({ ...current, [projectId]: choice }))
  }, [])
  const chosen = useMemo(
    () => projectIds.map((projectId) => ({ projectId, choice: made[projectId] ?? 'skip' })),
    [projectIds, made],
  )
  return { choiceFor, choose, chosen }
}
