import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ADMIN_TREE } from './controls'
import { F1, F2, folders, P, renderTree } from './testing/tree-fixture'

const openMenu = async (user: ReturnType<typeof renderTree>['user'], index: number) => {
  const triggers = screen.getAllByRole('button', { name: 'Folder options' })
  const trigger = triggers[index]
  if (trigger === undefined) throw new Error(`no folder at ${String(index)}`)
  await user.click(trigger)
  return screen.getByRole('menu')
}

describe('a folder', () => {
  it('renames in place and sends the folder with the name', async () => {
    const { actions, user } = renderTree()
    const [first] = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Folder name' })
    if (first === undefined) throw new Error('no folder name')
    await user.clear(first)
    await user.type(first, 'ACME Corp{Enter}')
    expect(actions.renameFolder).toHaveBeenCalledWith(P, F1, 'ACME Corp')
  })

  it('says why a rename was refused once, at the field it was typed in, and not again on the tree’s line', async () => {
    const { actions, user } = renderTree()
    actions.renameFolder.mockResolvedValue({ ok: false, status: 403, detail: 'Not allowed.' })
    const [first] = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Folder name' })
    if (first === undefined) throw new Error('no folder name')
    await user.type(first, 'x{Enter}')
    const said = screen.getAllByRole('alert').filter((alert) => alert.textContent === 'Not allowed.')
    expect(said).toHaveLength(1)
    const heading = first.closest('h2')
    if (heading === null) throw new Error('the field is not in its folder heading')
    expect(within(heading).getByRole('alert')).toBe(said[0])
  })

  it('clears an earlier refusal on the tree’s line once a rename succeeds', async () => {
    const { actions, user } = renderTree()
    actions.reorderFolders.mockResolvedValue({ ok: false, status: 409, detail: 'This list changed.' })
    await openMenu(user, 0)
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(screen.getByRole('alert').textContent).toBe('This list changed.')
    const [first] = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Folder name' })
    if (first === undefined) throw new Error('no folder name')
    await user.type(first, 'x{Enter}')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('moves down as the whole folder order', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 0)
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }))
    expect(actions.reorderFolders).toHaveBeenCalledWith(P, [F2, F1])
  })

  it('moves up as the whole folder order', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 1)
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(actions.reorderFolders).toHaveBeenCalledWith(P, [F2, F1])
  })

  it('computes a move from position, not from the order the folders arrived in', async () => {
    const { actions, user } = renderTree({ folders: [...folders].reverse() })
    await openMenu(user, 1)
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(actions.reorderFolders).toHaveBeenCalledWith(P, [F2, F1])
  })

  it('cannot move the first folder up', async () => {
    const { user } = renderTree()
    await openMenu(user, 0)
    expect(screen.getByRole('menuitem', { name: 'Move up' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Move down' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('creates a task inside the folder', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 1)
    await user.click(screen.getByRole('menuitem', { name: 'New task in this folder' }))
    await user.type(screen.getByRole('textbox', { name: 'New task name' }), 'Kickoff call{Enter}')
    expect(actions.createTask).toHaveBeenCalledWith(P, 'Kickoff call', F2)
  })

  it('asks before deleting, naming the folder and saying its tasks are kept', async () => {
    const { actions, user } = renderTree()
    await openMenu(user, 0)
    await user.click(screen.getByRole('menuitem', { name: 'Delete folder' }))
    expect(screen.getByRole('heading', { name: 'Delete “ACME”?' })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('Its tasks are kept and move to the top level of this project.')
    await user.keyboard('{Enter}')
    expect(actions.deleteFolder).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))
    expect(actions.deleteFolder).toHaveBeenCalledWith(P, F1)
  })

  it('draws only the items controls allow, and no menu when none are', async () => {
    const { user, view } = renderTree({ controls: { ...ADMIN_TREE, createTask: false, deleteFolder: false } })
    const menu = await openMenu(user, 0)
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Move up', 'Move down'])
    view.unmount()
    renderTree({ controls: { ...ADMIN_TREE, createTask: false, deleteFolder: false, reorderFolders: false } })
    expect(screen.queryAllByRole('button', { name: 'Folder options' })).toEqual([])
  })
})
