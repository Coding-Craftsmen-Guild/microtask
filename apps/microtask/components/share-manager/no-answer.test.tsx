import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NO_ANSWER } from '@repo/app-session/no-answer'
import { links, renderManager } from './testing/share-fixture'

const dropped = new TypeError('Failed to fetch')

const open = async ({ user }: ReturnType<typeof renderManager>) => {
  await user.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('dialog', { name: 'Share this project' })
}

const janeOptions = async (manager: ReturnType<typeof renderManager>, dialog: HTMLElement) => {
  const row = within(dialog).getAllByTestId('link-row')[0] as HTMLElement
  await manager.user.click(within(row).getByRole('button', { name: 'Link options' }))
}

describe('a share manager call the server never answers', () => {
  it('stops saying Loading links… and says so, with Try again, when the list gets no answer', async () => {
    const manager = renderManager()
    manager.actions.list.mockRejectedValueOnce(dropped)
    const dialog = await open(manager)
    expect((await within(dialog).findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(within(dialog).queryByText('Loading links…')).toBeNull()
    await manager.user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByText('Jane at ACME')).toBeTruthy()
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('says a mint got no answer, and keeps the name typed so it can be sent again', async () => {
    const manager = renderManager()
    manager.actions.create.mockRejectedValueOnce(dropped)
    const dialog = await open(manager)
    const name = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Who is this link for?' })
    await manager.user.type(name, 'Sam{Enter}')
    expect((await within(dialog).findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(name.value).toBe('Sam')
  })

  it('says a role change got no answer, and leaves the link as it was', async () => {
    const manager = renderManager()
    manager.actions.update.mockRejectedValueOnce(dropped)
    const dialog = await open(manager)
    await janeOptions(manager, dialog)
    await manager.user.click(screen.getByRole('menuitem', { name: 'Set to read & write' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(within(dialog).getAllByTestId('link-row')[0]?.textContent).toContain('Read only')
  })

  it('says a revoke got no answer, and keeps the link listed', async () => {
    const manager = renderManager()
    manager.actions.revoke.mockRejectedValueOnce(dropped)
    const dialog = await open(manager)
    await janeOptions(manager, dialog)
    await manager.user.click(screen.getByRole('menuitem', { name: 'Revoke link' }))
    await manager.user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(within(dialog).getAllByTestId('link-row')).toHaveLength(links().length)
  })
})
