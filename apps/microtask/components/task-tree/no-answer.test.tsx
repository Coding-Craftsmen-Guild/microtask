import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NO_ANSWER } from '../shared/no-answer'
import { renderTree } from './testing/tree-fixture'
import type { TreeActions } from './types'

type Tree = ReturnType<typeof renderTree>

const taskMenu = async ({ user }: Tree, name: string) => {
  const row = screen.getByRole('link', { name }).closest('li')
  if (row === null) throw new Error(`no row for ${name}`)
  await user.click(within(row).getByRole('button', { name: 'Task options' }))
}

const folderMenu = async ({ user }: Tree) => {
  await user.click(screen.getAllByRole('button', { name: 'Folder options' })[0] as HTMLElement)
}

const confirm = async ({ user }: Tree, label: string) => {
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }))
}

const firstFolderName = () => screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Folder name' })[0] as HTMLInputElement

const DRIVE: { readonly [Name in keyof TreeActions]: (tree: Tree) => Promise<void> } = {
  createFolder: async (tree) => {
    await tree.user.click(screen.getByRole('button', { name: '+ Folder' }))
    await tree.user.type(screen.getByRole('textbox', { name: 'New folder name' }), 'Gamma{Enter}')
  },
  renameFolder: async (tree) => {
    await tree.user.type(firstFolderName(), 'x{Enter}')
  },
  deleteFolder: async (tree) => {
    await folderMenu(tree)
    await tree.user.click(screen.getByRole('menuitem', { name: 'Delete folder' }))
    await confirm(tree, 'Delete folder')
  },
  reorderFolders: async (tree) => {
    await folderMenu(tree)
    await tree.user.click(screen.getByRole('menuitem', { name: 'Move down' }))
  },
  createTask: async (tree) => {
    await tree.user.click(screen.getByRole('button', { name: '+ Task' }))
    await tree.user.type(screen.getByRole('textbox', { name: 'New task name' }), 'Launch{Enter}')
  },
  renameTask: async (tree) => {
    await taskMenu(tree, 'Go-live')
    await tree.user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await tree.user.type(screen.getByRole('textbox', { name: 'Task name' }), ' now{Enter}')
  },
  deleteTask: async (tree) => {
    await taskMenu(tree, 'Go-live')
    await tree.user.click(screen.getByRole('menuitem', { name: 'Delete task' }))
    await confirm(tree, 'Delete task')
  },
  moveTask: async (tree) => {
    await taskMenu(tree, 'Go-live')
    await tree.user.click(screen.getByRole('menuitem', { name: 'Move to Beta Co' }))
  },
  reorderTasks: async (tree) => {
    await taskMenu(tree, 'DNS cutover')
    await tree.user.click(screen.getByRole('menuitem', { name: 'Move up' }))
  },
}

describe('a tree write the server never answers', () => {
  it.each(Object.keys(DRIVE) as (keyof TreeActions)[])(
    'shows %s as failed, once, rather than leaving its rejection unhandled',
    async (name) => {
      const tree = renderTree()
      tree.actions[name].mockRejectedValue(new TypeError('Failed to fetch'))
      await DRIVE[name](tree)
      expect(tree.actions[name]).toHaveBeenCalledTimes(1)
      const said = await screen.findAllByRole('alert')
      expect(said.map((alert) => alert.textContent)).toEqual([NO_ANSWER.detail])
    },
  )

  it('says it at the folder name field for a folder rename, where a refusal is said', async () => {
    const tree = renderTree()
    tree.actions.renameFolder.mockRejectedValue(new TypeError('Failed to fetch'))
    await DRIVE.renameFolder(tree)
    const heading = firstFolderName().closest('h2')
    if (heading === null) throw new Error('no folder heading')
    expect(within(heading).getByRole('alert').textContent).toBe(NO_ANSWER.detail)
    expect(firstFolderName().value).toBe('ACME')
  })
})
