import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ADMIN_TREE, type TreeControls } from '../controls'
import { TaskTree } from '../task-tree'
import type { RowTask, TreeActions } from '../types'

/** The instant every fixture page is rendered at. */
export const NOW = Date.parse('2026-09-11T12:00:00.000Z')

/** The project. */
export const P = '01HZZZZZZZZZZZZZZZZZZZZZP1'

/** The first folder, `ACME`. */
export const F1 = '01HZZZZZZZZZZZZZZZZZZZZZF1'

/** The second folder, `Beta Co`. */
export const F2 = '01HZZZZZZZZZZZZZZZZZZZZZF2'

/** `Go-live`, first in `ACME`. */
export const T1 = '01HZZZZZZZZZZZZZZZZZZZZZT1'

/** `DNS cutover`, second in `ACME`. */
export const T2 = '01HZZZZZZZZZZZZZZZZZZZZZT2'

/** `Kickoff`, alone in `Beta Co`. */
export const T3 = '01HZZZZZZZZZZZZZZZZZZZZZT3'

/** `Hosting notes`, at the project root. */
export const R1 = '01HZZZZZZZZZZZZZZZZZZZZZR1'

/** Both folders, in order. */
export const folders = [
  { id: F1, name: 'ACME', position: 0 },
  { id: F2, name: 'Beta Co', position: 1 },
]

/** A task entry with three tabs, half done, updated an hour before {@link NOW}. */
export const task = (id: string, name: string, folderId: string | null, position: number): RowTask => ({
  id,
  name,
  folderId,
  position,
  progress: { done: 1, total: 2 },
  updatedAt: new Date(NOW - 3_600_000).toISOString(),
  tabCount: 3,
  tabNames: ['General', 'DNS', 'Launch'],
})

/** Every task, in no particular order. */
export const tasks = [
  task(T1, 'Go-live', F1, 0),
  task(T2, 'DNS cutover', F1, 1),
  task(T3, 'Kickoff', F2, 0),
  task(R1, 'Hosting notes', null, 0),
]

const ok = <Value,>(value: Value) => Promise.resolve({ ok: true as const, value })

/** Every tree write as a recording double that succeeds, a rename answering the name it was sent. */
export const fakeActions = () => ({
  createFolder: vi.fn<TreeActions['createFolder']>(() => ok(null)),
  renameFolder: vi.fn<TreeActions['renameFolder']>((_p, _f, name) => ok(name)),
  deleteFolder: vi.fn<TreeActions['deleteFolder']>(() => ok(null)),
  reorderFolders: vi.fn<TreeActions['reorderFolders']>(() => ok(null)),
  createTask: vi.fn<TreeActions['createTask']>(() => Promise.resolve(undefined)),
  renameTask: vi.fn<TreeActions['renameTask']>((_p, _t, name) => ok(name)),
  deleteTask: vi.fn<TreeActions['deleteTask']>(() => ok(null)),
  moveTask: vi.fn<TreeActions['moveTask']>(() => ok(null)),
  reorderTasks: vi.fn<TreeActions['reorderTasks']>(() => ok(null)),
})

/** What a test may vary about the tree it renders. */
export interface TreeSetup {
  /** The controls, an admin's by default. */
  readonly controls?: TreeControls
  /** Share links per task, withheld by default. */
  readonly linkCounts?: Readonly<Record<string, number>> | undefined
  /** The tasks, {@link tasks} by default. */
  readonly tasks?: readonly RowTask[]
  /** The folders, {@link folders} by default. */
  readonly folders?: typeof folders
}

/** Renders the tree over the fixture, answering the doubles and a user to drive it. */
export const renderTree = (setup: TreeSetup = {}) => {
  const actions = fakeActions()
  const view = render(
    <TaskTree
      actions={actions}
      controls={setup.controls ?? ADMIN_TREE}
      folders={setup.folders ?? folders}
      linkCounts={setup.linkCounts}
      now={NOW}
      projectId={P}
      tasks={setup.tasks ?? tasks}
    />,
  )
  return { actions, view, user: userEvent.setup() }
}
