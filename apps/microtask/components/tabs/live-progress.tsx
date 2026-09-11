'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProgressValue } from '@repo/contracts'
import type { PrincipalKind } from '../../lib/principal'
import { LinkProgress } from '../link/link-progress'
import { OverallProgress } from '../projects/overall-progress'

interface Live {
  readonly value: ProgressValue
  readonly publish: (next: ProgressValue) => void
}

const LiveProgress = createContext<Live | null>(null)

/** Props for {@link LiveProgressProvider}. */
export interface LiveProgressProviderProps {
  /** The task's progress as the server rendered it, shown until the workspace publishes one. */
  readonly initial: ProgressValue
  /** The head that shows the count and the workspace that publishes it. */
  readonly children: ReactNode
}

/**
 * Carries the task-wide count from the workspace, which knows it, to the title row, which shows it.
 *
 * The two are siblings rendered by a Server Component, so the count travels through context
 * rather than props. A publish of the same figures keeps the value it replaces, so a workspace
 * re-rendering on every keystroke does not re-render the head unless the count moved.
 */
export function LiveProgressProvider({ initial, children }: LiveProgressProviderProps) {
  const [value, setValue] = useState(initial)
  const publish = useCallback((next: ProgressValue) => {
    setValue((previous) => (previous.done === next.done && previous.total === next.total ? previous : next))
  }, [])
  const live = useMemo(() => ({ value, publish }), [value, publish])
  return <LiveProgress.Provider value={live}>{children}</LiveProgress.Provider>
}

/** Hands the task-wide count to the title row, if the page has one. */
export function usePublishProgress({ done, total }: ProgressValue): void {
  const publish = useContext(LiveProgress)?.publish
  useEffect(() => {
    publish?.({ done, total })
  }, [publish, done, total])
}

/** Props for {@link LiveOverallProgress}. */
export interface LiveOverallProgressProps {
  /** Which surface's words: `No tasks yet` for the admin, `A shared project workspace` for a link. */
  readonly audience: PrincipalKind
  /** What to show outside a provider, and before anything is published. */
  readonly fallback: ProgressValue
}

/**
 * The title row's `Overall progress: N%` and bar, following the workspace as the user types — the
 * app being replaced re-rendered its header on every keystroke (parity features 16 and 51).
 */
export function LiveOverallProgress({ audience, fallback }: LiveOverallProgressProps) {
  const progress = useContext(LiveProgress)?.value ?? fallback
  return audience === 'admin' ? <OverallProgress {...progress} /> : <LinkProgress {...progress} />
}
