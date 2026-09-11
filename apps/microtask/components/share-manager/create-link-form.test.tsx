import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { P, renderManager, T1, T2 } from './testing/share-fixture'

type User = ReturnType<typeof renderManager>['user']

const opened = async (user: User) => {
  await user.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('dialog', { name: 'Share this project' })
}

const nameField = (dialog: HTMLElement) => within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Who is this link for?' })

describe('creating a link', () => {
  it('defaults to a read-only link over the first task', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.type(nameField(dialog), 'Jane{Enter}')
    expect(actions.create).toHaveBeenCalledWith(P, { name: 'Jane', role: 'view', scope: { kind: 'task', projectId: P, taskId: T1 } })
  })

  it('mints the role and task chosen', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.type(nameField(dialog), 'Sam')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Access' }), 'write')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Opens' }), 'Kickoff')
    await user.click(within(dialog).getByRole('button', { name: 'Add link' }))
    expect(actions.create).toHaveBeenCalledWith(P, { name: 'Sam', role: 'write', scope: { kind: 'task', projectId: P, taskId: T2 } })
  })

  it('appends the new link, clears the name, and keeps the choices', async () => {
    const { user } = renderManager()
    const dialog = await opened(user)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Access' }), 'Manage')
    await user.type(nameField(dialog), 'Newcomer{Enter}')
    expect(within(dialog).getByText('Newcomer')).toBeTruthy()
    expect(nameField(dialog).value).toBe('')
    expect(within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Access' }).value).toBe('manage')
    expect(within(dialog).getByRole('status').textContent).toBe('Link created.')
  })

  it('asks before a project-scoped link, listing what it would open', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Opens' }), 'Whole project')
    await user.type(nameField(dialog), 'Everyone{Enter}')
    expect(actions.create).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Share the whole project?' })).toBeTruthy()
    expect(document.body.textContent).toContain('Folders: ACME. Tasks: Go-live, Kickoff.')
    await user.click(screen.getByRole('button', { name: 'Add project link' }))
    expect(actions.create).toHaveBeenCalledWith(P, { name: 'Everyone', role: 'view', scope: { kind: 'project', projectId: P } })
  })

  it('lets no Enter mint a project-scoped link: only a click on the confirm does', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Opens' }), 'Whole project')
    await user.type(nameField(dialog), 'Everyone{Enter}')
    await user.keyboard('{Enter}')
    expect(actions.create).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Share the whole project?' })).toBeTruthy()
  })

  it('mints nothing when the project-scope confirm is cancelled', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Opens' }), 'Whole project')
    await user.type(nameField(dialog), 'Everyone{Enter}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(actions.create).not.toHaveBeenCalled()
    expect(nameField(dialog).value).toBe('Everyone')
  })

  it('makes no request without a name, and says so', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await user.type(nameField(dialog), '   {Enter}')
    expect(actions.create).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert').textContent).toBe('Say who this link is for.')
  })

  it('keeps the name and says why when the API refuses', async () => {
    const { actions, user } = renderManager()
    actions.create.mockResolvedValue({ ok: false, status: 422, detail: 'Too many share links' })
    const dialog = await opened(user)
    await user.type(nameField(dialog), 'Jane{Enter}')
    expect(nameField(dialog).value).toBe('Jane')
    expect(within(dialog).getByRole('alert').textContent).toBe('Too many share links')
  })

  it('caps the name at the length the API accepts, with legacy’s placeholder', async () => {
    const { user } = renderManager()
    const dialog = await opened(user)
    expect(nameField(dialog).maxLength).toBe(80)
    expect(nameField(dialog).placeholder).toBe('Who is this link for? e.g. Jane at ACME')
  })

  it('is absent for a holder who can list but not create', async () => {
    const { user } = renderManager({ controls: { read: true, create: false, update: true, revoke: true } })
    const dialog = await opened(user)
    expect(within(dialog).queryByRole('button', { name: 'Add link' })).toBeNull()
  })
})
