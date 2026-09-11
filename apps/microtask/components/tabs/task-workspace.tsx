'use client'

import { useState } from 'react'
import type { TaskRef } from '@repo/api-client'
import { countTasks, type Capabilities } from '@repo/contracts'
import type { PrincipalKind } from '../../lib/principal'
import { DocumentEditor } from '../editor/document-editor'
import { TabDialogs, type TabDialog } from './tab-dialogs'
import { TabProgressRow } from './tab-progress-row'
import { TabStrip } from './tab-strip'
import { tabControls } from './tab-controls'
import { useOverallProgress } from './use-overall-progress'
import { useTabOperations, type Notice, type TabActions } from './use-tab-operations'
import { useWorkspace } from './use-workspace'
import type { WorkspaceTab } from './workspace-state'

/** Props for {@link TaskWorkspace}. */
export interface TaskWorkspaceProps {
  /** The task whose tabs these are. */
  task: TaskRef
  /** Its tabs, in order, as the server rendered them. */
  tabs: readonly WorkspaceTab[]
  /** The tab to open on, already validated against `tabs`. */
  initialTabId: string
  /** What the viewer may do — `ADMIN_CAPABILITIES` here, `capabilities(role, scope)` on `/s/*`. */
  capabilities: Capabilities
  /** Which surface is rendering. */
  audience: PrincipalKind
  /** Where documents are written; see `adminDocumentRoot`. */
  documentRoot: string
  /** The structural writes, as this surface's Server Actions. */
  actions: TabActions
}

const NoticeLine = ({ notice }: { notice: Notice | null }) =>
  notice === null ? null : (
    <p className={notice.tone === 'error' ? 'py-2 text-sm text-destructive' : 'py-2 text-sm text-muted-foreground'} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  )

/**
 * The task page's working area: tab strip, the open tab's progress, and the editor island.
 *
 * It also publishes the task-wide count to the title row, if the page gave it one
 * (`LiveProgressProvider`), so the head's bar follows typing. Every control is drawn from
 * `capabilities`, never from a role, so the client surface can reuse
 * this unchanged (ADR 0038). The island is keyed on the open tab and the mount count, so it is
 * remounted exactly when it must read a different document or stamp — see `workspaceReducer`.
 */
export function TaskWorkspace(props: TaskWorkspaceProps) {
  const workspace = useWorkspace(props)
  const { state, dispatch } = workspace
  useOverallProgress(state)
  const operations = useTabOperations(workspace, props.actions, props.task)
  const controls = tabControls(props.capabilities)
  const [dialog, setDialog] = useState<TabDialog | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const active = state.tabs.find((tab) => tab.id === state.active)
  if (active === undefined) return null
  return (
    <section className="grid">
      <TabStrip
        active={state.active}
        controls={controls}
        live={state.live}
        menuFor={menuFor}
        onCreate={() => setDialog({ kind: 'create' })}
        onDelete={(tab) => setDialog({ kind: 'delete', tab })}
        onMenu={setMenuFor}
        onMove={(tab, direction) => void operations.move(tab, direction)}
        onRename={(tab) => setDialog({ kind: 'rename', tab })}
        onSelect={(tabId) => void operations.select(tabId)}
        tabs={state.tabs}
      />
      <NoticeLine notice={operations.notice} />
      <TabProgressRow audience={props.audience} name={active.name} progress={state.live ?? countTasks(active.document)} writable={controls.write} />
      <DocumentEditor
        document={state.seed.document}
        editable={controls.write}
        key={`${state.active}:${String(state.mount)}`}
        onProgress={(progress) => dispatch({ type: 'progress', progress })}
        onReload={workspace.reload}
        ref={workspace.editor}
        save={workspace.save}
        updatedAt={state.seed.updatedAt}
      />
      <TabDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onCreate={(name) => void operations.create(name)}
        onDelete={(tab) => void operations.remove(tab)}
        onRename={(tab, name) => void operations.rename(tab, name)}
      />
    </section>
  )
}
