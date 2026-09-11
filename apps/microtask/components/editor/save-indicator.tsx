'use client'

import { SaveAlert } from './save-alert'
import { SAVE_TEXT } from './save-copy'
import type { SaveState } from './save-document'

const TONE: Readonly<Record<SaveState, string>> = {
  idle: 'text-muted-foreground',
  saving: 'text-gold-deep',
  saved: 'text-muted-foreground',
  retrying: 'text-destructive',
  conflict: 'text-destructive',
  refused: 'text-destructive',
}

/** Props for {@link SaveIndicator}. */
export interface SaveIndicatorProps {
  /** What the loop is doing. */
  state: SaveState

  /** What the last failure said, shown beside the retry text or in a refusal's alert. */
  message: string

  /** Reloads the tab from the server, discarding nothing until it is chosen. */
  onReload: () => void

  /** Writes the held edits again after a refusal, only when it is chosen. */
  onRetry: () => void
}

/**
 * The save state, as a live region, plus the alert a held state needs.
 *
 * A conflict and a refusal are deliberately not just another word in the same span: each means
 * the loop has stopped writing, and each needs an affordance the user chooses — a reload, or a
 * retry (`SaveAlert`). Legacy had neither: it was last-write-wins, and it retried every refusal
 * every four seconds for as long as the page stayed open (ADR 0016).
 */
export function SaveIndicator({ state, message, onReload, onRetry }: SaveIndicatorProps) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] whitespace-nowrap">
      <span aria-live="polite" className={TONE[state]} role="status">
        {SAVE_TEXT[state]}
        {state === 'retrying' && message !== '' ? ` · ${message}` : ''}
      </span>
      <SaveAlert message={message} onReload={onReload} onRetry={onRetry} state={state} />
    </span>
  )
}
