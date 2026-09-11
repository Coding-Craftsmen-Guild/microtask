import type { SaveState } from './save-document'

/**
 * What the status line says in each state: legacy's three words verbatim, ellipses included,
 * plus `Not saved` for a refusal the loop has stopped on.
 *
 * `idle` is the empty string rather than a missing entry, because blanking the indicator is
 * what a tab switch does and that is a state the label has to be able to reach. A conflict says
 * nothing here: its alert says everything.
 */
export const SAVE_TEXT: Readonly<Record<SaveState, string>> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  retrying: 'Not saved — retrying…',
  conflict: '',
  refused: 'Not saved',
}

/** What a 409 says. Legacy was last-write-wins and said nothing at all (ADR 0016). */
export const CONFLICT_TEXT = 'Someone else saved this tab'

/**
 * What a reload costs, said before it is chosen. The edits stay in the editor until then, and
 * the user is told before anything is discarded (ADR 0016).
 */
export const CONFLICT_COST = 'Reloading discards your unsaved edits.'

/**
 * What a refusal leaves the user holding, said beside the reason the route gave. Nothing will
 * write the edits on its own any more, so the one thing left to say is where they are and that
 * leaving the page loses them (ADR 0016).
 */
export const REFUSED_COST = 'Your edits stay in this tab until you leave the page, so copy out anything you need.'
