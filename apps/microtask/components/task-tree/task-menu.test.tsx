import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ADMIN_TREE } from './controls'
import { F1, F2, P, R1, renderTree, T1, T2, T3 } from './testing/tree-fixture'

const rowOf = (name: string) => {
  const link = screen.getByRole('link', { name })
  const row = link.closest('li')
  if (row === null) throw new Error(`no row for ${name}`)
  return row
}

const openMenu = async (user: ReturnType<typeof renderTree>['user'], name: string) => {
  await user.click(within(rowOf(name)).getByRole('button', { name: 'Task options' }))
  return screen.getByRole('menu')
}

describe('a task’s options', () => {
  it('renames in place and shows the name the server stored', async () => {
    const { actions, user } = renderTree()
    actions.renameTask.mockResolvedValue({ ok: true, value: 'Launch, as stored' })
    await openMenu(user, 'Go-live')
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Task name' })
    expect(document.activeElement).toBe(field)
    await user.clear(field)
    await user.type(field, 'Launch{Enter}')
    expect(actions.renameTask).toHaveBeenCalledWith(P, T1, 'Launch')
    expect(screen.getByRole('link', { name: 'Launch, as stored' })).toBeTruthy()
  })

  it('leaves the name and sends nothing when the rename is abandoned with Escape', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'Go-live')
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.type(screen.getByRole('textbox', { name: 'Task name' }), 'x{Escape}')
    expect(actions.renameTask).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Go-live' })).toBeTruthy()
  })

  it('moves a task up as the whole group order', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'DNS cutover')
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(actions.reorderTasks).toHaveBeenCalledWith(P, F1, [T2, T1])
  })

  it('moves a task down as the whole group order', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'Go-live')
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(actions.reorderTasks).toHaveBeenCalledWith(P, F1, [T2, T1])
  })

  it('computes a move from the whole group even while a search hides part of it', async () => {
    const { actions, user } = renderTree()
    await user.type(screen.getByRole('searchbox'), 'dns')
    await openMenu(user, 'DNS cutover')
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(actions.reorderTasks).toHaveBeenCalledWith(P, F1, [T2, T1])
  })

  it('cannot move the first task up or the last one down', async () => {
    const { user } = renderTree()
    await openMenu(user, 'Go-live')
    expect(screen.getByRole('menuitem', { name: 'Move up' }).getAttribute('aria-disabled')).toBe('true')
    await user.keyboard('{Escape}')
    await openMenu(user, 'DNS cutover')
    expect(screen.getByRole('menuitem', { name: 'Move down' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('moves a task to another folder or to no folder, and offers no move to where it already is', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'Kickoff')
    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(labels).toContain('Move to ACME')
    expect(labels).not.toContain('Move to Beta Co')
    await user.click(screen.getByRole('menuitem', { name: 'Move to No folder' }))
    expect(actions.moveTask).toHaveBeenCalledWith(P, T3, null)
  })

  it('moves a root task into a folder', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'Hosting notes')
    expect(screen.queryByRole('menuitem', { name: 'Move to No folder' })).toBeNull()
    await user.click(screen.getByRole('menuitem', { name: 'Move to Beta Co' }))
    expect(actions.moveTask).toHaveBeenCalledWith(P, R1, F2)
  })

  it('asks before deleting, naming the task, and Enter cannot confirm', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 'Go-live')
    await user.click(screen.getByRole('menuitem', { name: 'Delete task' }))
    expect(screen.getByRole('heading', { name: 'Delete “Go-live”?' })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('All of its tabs and their content are deleted.')
    await user.keyboard('{Enter}')
    expect(actions.deleteTask).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(actions.deleteTask).toHaveBeenCalledWith(P, T1)
  })

  it('shows a refused move to the user, not a silent retry', async () => {
    const { actions, user } = renderTree()
    actions.reorderTasks.mockResolvedValue({ ok: false, status: 409, detail: 'This list changed.' })
    await openMenu(user, 'DNS cutover')
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(screen.getByRole('alert').textContent).toBe('This list changed.')
    expect(actions.reorderTasks).toHaveBeenCalledTimes(1)
  })

  it('draws only the items controls allow', async () => {
    const { user } = renderTree({ controls: { ...ADMIN_TREE, moveTask: false, deleteTask: false } })
    const menu = await openMenu(user, 'Go-live')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename',
      'Move up',
      'Move down',
    ])
  })
})
