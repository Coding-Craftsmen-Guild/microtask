'use client'

import { Button } from '@repo/ui/components/button'
import { CONFLICT_COST, CONFLICT_TEXT, REFUSED_COST } from './save-copy'
import type { SaveState } from './save-document'

/** Props for {@link SaveAlert}. */
export interface SaveAlertProps {
  /** What the loop is doing; only `conflict` and `refused` render anything. */
  state: SaveState

  /** Why a refused write was refused, in the route's plain words. */
  message: string

  /** Reloads the tab from the server, offered for a conflict. */
  onReload: () => void

  /** Writes the held edits again, offered for a refusal. */
  onRetry: () => void
}

/**
 * The two states in which the loop holds edits it will not write on its own, each with the one
 * affordance it needs: a conflict offers a reload, since the stored document moved on, and a
 * refusal offers a retry, since only the user knows whether the reason has gone away — the
 * admin signed in again in another tab, say. Neither acts unasked (ADR 0016).
 */
export function SaveAlert({ state, message, onReload, onRetry }: SaveAlertProps) {
  if (state === 'conflict') {
    return (
      <span className="flex items-center gap-2 text-destructive" role="alert">
        <span>
          {CONFLICT_TEXT}. {CONFLICT_COST}
        </span>
        <Button onClick={onReload} size="xs" variant="outline">
          Reload this tab
        </Button>
      </span>
    )
  }
  if (state !== 'refused') return null
  return (
    <span className="flex items-center gap-2 whitespace-normal text-destructive" role="alert">
      <span>
        {message} {REFUSED_COST}
      </span>
      <Button onClick={onRetry} size="xs" variant="outline">
        Try again
      </Button>
    </span>
  )
}
