'use client'

import { useState } from 'react'

/** One line under the strip: what a write was refused with, or what it did. */
export interface Notice {
  /** `error` is read out as an alert; `done` politely. */
  readonly tone: 'error' | 'done'

  /** The sentence itself. */
  readonly text: string
}

/** The line under the strip, as {@link useNotice} holds it. */
export interface NoticeState {
  /** What to show now, or `null`. */
  readonly notice: Notice | null

  /** Shows a notice until the next one, or clears the line with `null`. */
  readonly say: (notice: Notice | null) => void

  /** Shows a notice only for as long as the open tab stays at the version it was said about. */
  readonly sayAbout: (notice: Notice) => void
}

/**
 * The notice line, where a notice may be about **one version of the open tab** and lapse with it.
 *
 * "This tab has edits that are not saved" stops being true the moment the island is remounted by
 * a reload, or the held edits land and move the tab's stamp, and neither happens through a tab
 * operation that could clear it. So it is pinned to `version` — the island's mount and the open
 * tab's stamp — and not shown once that has moved on. Every other notice lasts until the next.
 */
export function useNotice(version: string): NoticeState {
  const [shown, setShown] = useState<{ readonly notice: Notice; readonly at: string | null } | null>(null)
  const current = shown === null || (shown.at !== null && shown.at !== version) ? null : shown.notice
  return {
    notice: current,
    say: (notice) => setShown(notice === null ? null : { notice, at: null }),
    sayAbout: (notice) => setShown({ notice, at: version }),
  }
}
