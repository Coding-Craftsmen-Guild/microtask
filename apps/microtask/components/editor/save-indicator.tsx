'use client'

import { Button } from '@repo/ui/components/button'
import type { SaveState } from './save-document'

/**
 * The three words legacy showed, verbatim, including the ellipsis characters.
 *
 * `idle` is the empty string rather than a missing entry, because blanking the indicator is
 * what a tab switch does and that is a state the label has to be able to reach.
 */
export const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  retrying: 'Not saved — retrying…',
  conflict: '',
}

/** What a 409 says. Legacy was last-write-wins and said nothing at all (ADR 0016). */
export const CONFLICT_TEXT = 'Someone else saved this tab'

const TONE: Readonly<Record<SaveState, string>> = {
  idle: 'text-muted-foreground',
  saving: 'text-gold-deep',
  saved: 'text-muted-foreground',
  retrying: 'text-destructive',
  conflict: 'text-destructive',
}

/** Props for {@link SaveIndicator}. */
export interface SaveIndicatorProps {
  /** What the loop is doing. */
  state: SaveState

  /** What the last failure said, shown beside the retry text. */
  message: string

  /** Reloads the tab from the server, discarding nothing until it is chosen. */
  onReload: () => void
}

/**
 * The save state, as a live region, plus the one affordance a conflict needs.
 *
 * A conflict is deliberately not a fifth word in the same span: a 409 means the stored document
 * moved on, and the only honest next step is a reload the user asks for. Legacy had no such
 * state because it was last-write-wins, so this is the visible half of ADR 0016.
 */
export function SaveIndicator({ state, message, onReload }: SaveIndicatorProps) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] whitespace-nowrap">
      <span aria-live="polite" className={TONE[state]} role="status">
        {SAVE_TEXT[state]}
        {state === 'retrying' && message !== '' ? ` · ${message}` : ''}
      </span>
      {state === 'conflict' ? (
        <span className="flex items-center gap-2 text-destructive" role="alert">
          {CONFLICT_TEXT}
          <Button onClick={onReload} size="xs" variant="outline">
            Reload this tab
          </Button>
        </span>
      ) : null}
    </span>
  )
}
