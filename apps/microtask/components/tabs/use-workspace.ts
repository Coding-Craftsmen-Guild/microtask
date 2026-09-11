'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import type { TaskRef } from '@repo/api-client'
import type { DocumentEditorHandle } from '../editor/document-editor'
import type { SaveDocument } from '../editor/save-document'
import { markChanged, takeChanged } from './changed-tasks'
import { saveTabDocument, tabDocumentUrl } from './save-tab'
import {
  initialWorkspace,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
  type WorkspaceTab,
} from './workspace-state'

/** What the page hands the workspace: the task, its tabs, the validated `?tab=`, the save root. */
export interface WorkspaceInput {
  /** The task the tabs belong to. */
  readonly task: TaskRef

  /** The task's tabs in order, as the server last rendered them. */
  readonly tabs: readonly WorkspaceTab[]

  /** The tab to open on, already validated against {@link tabs}. */
  readonly initialTabId: string

  /** Where this surface writes documents; see `adminDocumentRoot`. */
  readonly documentRoot: string
}

/** The workspace as its components hold it. */
export interface Workspace {
  /** Everything the strip and the island are drawn from. */
  readonly state: WorkspaceState

  /** Applies one transition. */
  readonly dispatch: Dispatch<WorkspaceAction>

  /** The mounted island's handle: flush before leaving a tab, go quiet before deleting one. */
  readonly editor: RefObject<DocumentEditorHandle | null>

  /** The open tab's save, which records every version it lands. */
  readonly save: SaveDocument

  /** Drops the open tab's edits and remounts it on what the server holds now. */
  readonly reload: () => void
}

const useServerTabs = (tabs: readonly WorkspaceTab[], dispatch: Dispatch<WorkspaceAction>): void => {
  const [seen, setSeen] = useState(tabs)
  if (seen !== tabs) {
    setSeen(tabs)
    dispatch({ type: 'server', tabs })
  }
}

const useTabInUrl = (active: string): void => {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tab') === active) return
    url.searchParams.set('tab', active)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [active])
}

/**
 * Holds the task page's tabs, the open tab, and the one island mounted on it.
 *
 * **`?tab=` is written with `replaceState`**, never `pushState`, on mount and on every switch: the
 * address bar is always shareable and Back leaves the page rather than walking tab history, as it
 * did in the app being replaced. Next integrates a native `replaceState` into its router, so no
 * navigation and no server round trip follows.
 *
 * **Fresh tabs from the server are applied as they arrive** — a `router.refresh()` hands the page
 * new props, and the reducer takes them without remounting the island unless a reload asked it
 * to. A reload is the conflict path (ADR 0016), and it is also taken on mount when this browser
 * changed the task since the payload being shown was rendered: Next reuses a page's payload on
 * Back and Forward, and an island opened on it would take its own last save for somebody else's.
 *
 * Every version a save lands is recorded on its tab, so leaving a tab and coming back opens the
 * island on the document and stamp it last saved rather than on the ones the page loaded with.
 */
export function useWorkspace(input: WorkspaceInput): Workspace {
  const { task, documentRoot } = input
  const [state, dispatch] = useReducer(workspaceReducer, input, (first) =>
    initialWorkspace(first.tabs, first.initialTabId),
  )
  useServerTabs(input.tabs, dispatch)
  useTabInUrl(state.active)
  const editor = useRef<DocumentEditorHandle>(null)
  const router = useRouter()
  const reload = useCallback(() => {
    editor.current?.markClean()
    dispatch({ type: 'reload' })
    router.refresh()
  }, [router])
  useEffect(() => {
    if (takeChanged(task.taskId)) reload()
  }, [reload, task.taskId])
  const save = useMemo<SaveDocument>(() => {
    const tabId = state.active
    const write = saveTabDocument(tabDocumentUrl(documentRoot, tabId))
    return async (request) => {
      const outcome = await write(request)
      if (outcome.kind !== 'saved') return outcome
      markChanged(task.taskId)
      dispatch({ type: 'saved', tabId, document: request.document, updatedAt: outcome.updatedAt })
      return outcome
    }
  }, [documentRoot, state.active, task.taskId])
  return { state, dispatch, editor, save, reload }
}
