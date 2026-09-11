import type { ProgressValue } from '@repo/contracts'
import type { ReactNode } from 'react'
import { AccessBadge } from './access-badge'
import { LinkProgress } from './link-progress'

/** Props for {@link LinkHead}. */
export interface LinkHeadProps {
  /** The page's heading: the task's name, or on a project-scoped list the project's. */
  title: string
  /** The checklist count the head summarises. */
  progress: ProgressValue
  /** Whether the editor is writable, which decides the badge. */
  writable: boolean
  /** Share, when this link may list or mint links; the manager draws nothing otherwise. */
  share: ReactNode
}

/**
 * A link page's head: the name, Share, and the wrapping row of progress and access badge.
 *
 * Legacy followed the badge with `Signed in as <link name>`. `ShareView` carries no link name —
 * the bootstrap answer describes what a token reaches, not whom it was minted for — so that line
 * is not drawn rather than drawn wrong.
 */
export function LinkHead({ title, progress, writable, share }: LinkHeadProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-4 max-sm:flex-wrap">
        <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight">{title}</h1>
        {share}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LinkProgress done={progress.done} total={progress.total} />
        <AccessBadge writable={writable} />
      </div>
    </div>
  )
}
