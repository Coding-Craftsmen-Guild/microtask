'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentValue } from '@repo/contracts'
import { Autosave } from './autosave'
import { leavesPage, LEAVE_QUESTION } from './leave-guard'
import type { SaveDocument, SaveState } from './save-document'

/** What {@link useAutosave} needs. */
export interface UseAutosaveOptions {
  /** The tab's `updatedAt` as the server last reported it. Read once, on mount. */
  readonly updatedAt: string

  /** Where a write goes. May be a fresh closure on every render. */
  readonly save: SaveDocument

  /**
   * Whether this view writes at all. A read-only one leaves `Ctrl/Cmd+S` to the browser, as the
   * app being replaced did on its share page. Read once, on mount.
   */
  readonly editable: boolean
}

/** The loop, as a component holds it. */
export interface AutosaveHandle {
  /** What the indicator should show. */
  readonly state: SaveState

  /** What the last failure said. Empty until one. */
  readonly message: string

  /** Records an edit and arms the 700 ms debounce. */
  readonly change: (document: DocumentValue) => void

  /**
   * Writes now, overtaking the debounce, and settles once the write has: `false` when the loop
   * is left holding edits, in a conflict or waiting to retry a failure, and `true` otherwise.
   */
  readonly flush: () => Promise<boolean>

  /** Drops the pending write, for a tab being left or deleted. */
  readonly markClean: () => void
}

const HELD: ReadonlySet<SaveState> = new Set(['conflict', 'retrying'])

const listen = (autosave: Autosave, editable: boolean): (() => void) => {
  let released = false
  const hidden = (): void => {
    if (document.visibilityState === 'hidden') void autosave.flush(false)
  }
  const leaving = (event: BeforeUnloadEvent): void => {
    if (!autosave.pending) return
    void autosave.flush(true)
    if (released) return
    event.preventDefault()
    event.returnValue = ''
  }
  const clicked = (event: MouseEvent): void => {
    if (!autosave.pending || !leavesPage(event, window.location.href)) return
    released = window.confirm(LEAVE_QUESTION)
    if (released) return
    event.preventDefault()
    event.stopPropagation()
  }
  const keydown = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    void autosave.flush(false)
  }
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('beforeunload', leaving)
  window.addEventListener('click', clicked, true)
  if (editable) window.addEventListener('keydown', keydown)
  return () => {
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('beforeunload', leaving)
    window.removeEventListener('click', clicked, true)
    window.removeEventListener('keydown', keydown)
    void autosave.flush(false).finally(() => autosave.dispose())
  }
}

/**
 * Holds one {@link Autosave} for the life of the component and wires it to the page.
 *
 * Three flush paths, and they do not carry the same request:
 *
 * - `visibilitychange → hidden` sends a **normal** request. It fires while the page is usually
 *   still alive and carries no size limit, which makes it the primary flush and the real mobile
 *   safety net, `beforeunload` being unreliable there (ADR 0028).
 * - `beforeunload` sends a `keepalive` request, and only for a body under the shared 64 KiB
 *   budget. Either way it asks for the browser's unsaved-changes prompt, which is the actual
 *   guard on that path — including when the body was too large to attempt, because saying
 *   nothing there is the silent loss, and while a write is still in flight, because closing
 *   the page can abort it before the server has the edit. Legacy asked only while dirty, and
 *   cleared dirty as the write was sent.
 * - `Ctrl/Cmd+S` writes now and suppresses the browser's Save-Page dialog, in every editable
 *   view. Legacy wired this on the admin page alone, so `Cmd+S` on a read-write share link
 *   opened that dialog over unsaved work; the asymmetry was an omission rather than a decision,
 *   and it is not reproduced. A read-only view has nothing to save and leaves the key alone.
 *
 * Unmounting writes a pending edit once, as a normal request, and then stops. Switching tab
 * remounts the island by key and a Next navigation fires neither `beforeunload` nor
 * `visibilitychange`, so without it an edit made inside the debounce window is simply dropped.
 * A failed unmount write is not retried — nothing is left on screen to say so — and a tab being
 * deleted calls `markClean` first, so there is nothing pending to resurrect it with.
 *
 * **So a link that would take the page elsewhere asks first**, while any edit is pending, the
 * way `beforeunload` does for a hard navigation (ADR 0016). Next offers no way to refuse its
 * navigation once it has started, so the question is put before Next sees the click: a
 * capture-phase `click` listener on `window` runs ahead of React's own dispatch, and asks
 * `window.confirm` — synchronous, because the click has to be cancelled or let through inside
 * its own dispatch. Staying cancels the click and stops it there, so neither Next's `<Link>` nor
 * the browser navigates and the island keeps its edits and its alert. Leaving lets the click
 * through untouched and keeps this island's `beforeunload` quiet, so a plain same-origin link,
 * whose hard navigation fires it, is not asked about twice. Which clicks count is `leavesPage`.
 *
 * The instance is created by a `useState` initialiser and never rebuilt, so a parent passing an
 * inline `save` closure cannot restart the loop mid-debounce and write the same edit twice. The
 * closure is reached through a ref, so a write always calls the newest one.
 */
export function useAutosave({ updatedAt, save, editable }: UseAutosaveOptions): AutosaveHandle {
  const [status, setStatus] = useState({ state: 'idle' as SaveState, message: '' })
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  }, [save])
  const [autosave] = useState(
    () =>
      new Autosave({
        updatedAt,
        save: (request) => latest.current(request),
        onState: (state, message) => setStatus({ state, message }),
      }),
  )
  const [writes] = useState(editable)
  useEffect(() => listen(autosave, writes), [autosave, writes])
  return useMemo(
    () => ({
      state: status.state,
      message: status.message,
      change: (document_: DocumentValue) => autosave.change(document_),
      flush: () => autosave.flush(false).then(() => !HELD.has(autosave.state)),
      markClean: () => autosave.markClean(),
    }),
    [autosave, status],
  )
}
