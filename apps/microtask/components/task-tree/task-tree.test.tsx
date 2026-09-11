import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { linkTreeControls } from './controls'
import { P, R1, renderTree, T1, task, tasks } from './testing/tree-fixture'

const TASK_SCOPE = { kind: 'task', projectId: P, taskId: T1 } as const
const PROJECT_SCOPE = { kind: 'project', projectId: P } as const

const taskNames = () => screen.getAllByTestId('task-name').map((name) => name.textContent)

describe('TaskTree', () => {
  it('draws folders in order with their tasks, then the tasks at the root', () => {
    renderTree()
    const names = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Folder name' })
    expect(names.map((name) => name.value)).toEqual(['ACME', 'Beta Co'])
    expect(taskNames()).toEqual(['Go-live', 'DNS cutover', 'Kickoff', 'Hosting notes'])
  })

  it('links each task to its page', () => {
    renderTree()
    expect(screen.getByRole('link', { name: 'Go-live' }).getAttribute('href')).toBe(`/p/${P}/t/${T1}`)
  })

  it('reads each task row in legacy shape: tabs, the task’s own share links, updated', () => {
    renderTree({ linkCounts: { [T1]: 2 } })
    const rows = screen.getAllByTestId('row-meta').map((meta) => meta.textContent)
    expect(rows[0]).toBe('3 tabs · 2 share links · updated 1h ago')
    expect(rows[1]).toBe('3 tabs · updated 1h ago')
  })

  it('omits the share-links clause for every row when the count was withheld', () => {
    renderTree({ linkCounts: undefined })
    expect(screen.getAllByTestId('row-meta').every((meta) => !meta.textContent.includes('share'))).toBe(true)
  })

  it('shows tab chips, with how many more there are', () => {
    renderTree({ tasks: [{ ...task(T1, 'Big', null, 0), tabCount: 12, tabNames: ['a', 'b'] }] })
    const chips = within(screen.getByRole('list', { name: 'Tabs' })).getAllByRole('listitem')
    expect(chips.map((chip) => chip.textContent)).toEqual(['a', 'b', '+10 more'])
  })

  it('draws each task’s cached progress, and the sum on its folder', () => {
    renderTree()
    expect(screen.getAllByText('1 / 2 · 50%')).toHaveLength(5)
    expect(screen.getByTestId(`folder-progress-${tasks[0]?.folderId ?? ''}`).textContent).toBe('2 / 4 · 50%')
  })

  it('filters the tree in place by name', async () => {
    const { user } = renderTree()
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks and folders' }), 'dns')
    expect(taskNames()).toEqual(['DNS cutover'])
  })

  it('says so when nothing matches', async () => {
    const { user } = renderTree()
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy()
  })

  it('says so, and offers create, when the project has no tasks or folders', () => {
    renderTree({ tasks: [], folders: [] })
    expect(screen.getByText('No tasks yet — create your first one above.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Task' })).toBeTruthy()
  })

  it('creates a task at the root from + Task', async () => {
    const { actions, user } = renderTree()
    await user.click(screen.getByRole('button', { name: '+ Task' }))
    await user.type(screen.getByRole('textbox', { name: 'New task name' }), 'Launch day{Enter}')
    expect(actions.createTask).toHaveBeenCalledWith(P, 'Launch day', null)
  })

  it('creates a folder from + Folder', async () => {
    const { actions, user } = renderTree()
    await user.click(screen.getByRole('button', { name: '+ Folder' }))
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Gamma{Enter}')
    expect(actions.createFolder).toHaveBeenCalledWith(P, 'Gamma')
  })

  it('says why a create was refused', async () => {
    const { actions, user } = renderTree()
    actions.createFolder.mockResolvedValue({ ok: false, status: 422, detail: 'Too many folders' })
    await user.click(screen.getByRole('button', { name: '+ Folder' }))
    await user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Gamma{Enter}')
    expect(screen.getByRole('alert').textContent).toBe('Too many folders')
  })
})

describe('TaskTree controls, from capabilities and never from role', () => {
  it('draws no + Folder and no sibling + Task for a task-scoped manage holder, which would 403', () => {
    renderTree({ controls: linkTreeControls('manage', TASK_SCOPE), tasks: [task(T1, 'Mine', null, 0)] })
    expect(screen.queryByRole('button', { name: '+ Folder' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Task' })).toBeNull()
  })

  it('draws no folder headings where the folder list is refused', () => {
    renderTree({ controls: linkTreeControls('manage', TASK_SCOPE) })
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([])
  })

  it('draws create but no options menu for a project-scoped write holder with nothing else to do', () => {
    renderTree({ controls: { ...linkTreeControls('write', PROJECT_SCOPE), renameTask: false, renameFolder: false } })
    expect(screen.getByRole('button', { name: '+ Task' })).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: 'Task options' })).toEqual([])
  })

  it('draws no controls at all for a viewer', () => {
    renderTree({ controls: linkTreeControls('view', PROJECT_SCOPE) })
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('textbox')).toEqual([])
  })

  it('draws folder names as text, not fields, where renaming folders is not drawn', () => {
    renderTree({ controls: linkTreeControls('view', PROJECT_SCOPE) })
    expect(screen.getByRole('heading', { name: 'ACME' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull()
  })

  it('keeps every row for a task-scoped holder even without folders', () => {
    renderTree({ controls: linkTreeControls('manage', TASK_SCOPE) })
    expect(taskNames()).toContain('Hosting notes')
    expect(screen.queryByRole('link', { name: 'Hosting notes' })?.getAttribute('href')).toBe(`/p/${P}/t/${R1}`)
  })
})
