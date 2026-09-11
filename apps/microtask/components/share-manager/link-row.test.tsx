import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLANK, JANE, link, P, renderManager } from './testing/share-fixture'

type User = ReturnType<typeof renderManager>['user']

const opened = async (user: User) => {
  await user.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('dialog', { name: 'Share this project' })
}

const rowNamed = (dialog: HTMLElement, name: string) => {
  const row = within(dialog).getByText(name).closest<HTMLElement>('[data-testid="link-row"]')
  if (row === null) throw new Error(`no row named ${name}`)
  return row
}

const menuOf = async (user: User, dialog: HTMLElement, name: string) => {
  await user.click(within(rowNamed(dialog, name)).getByRole('button', { name: 'Link options' }))
  return screen.getByRole('menu')
}

const clipboardAnswers = (writeText: () => Promise<void>, fallback: boolean) => {
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => fallback })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a link row', () => {
  it('says the link was copied only when it was', async () => {
    const { user } = renderManager()
    clipboardAnswers(() => Promise.resolve(), false)
    const dialog = await opened(user)
    await user.click(within(rowNamed(dialog, 'Jane at ACME')).getByRole('button', { name: 'Copy' }))
    expect(within(rowNamed(dialog, 'Jane at ACME')).getByRole('status').textContent).toBe('Link copied.')
  })

  it('says it could not copy when both the clipboard and the fallback fail', async () => {
    const { user } = renderManager()
    clipboardAnswers(() => Promise.reject(new Error('denied')), false)
    const dialog = await opened(user)
    await user.click(within(rowNamed(dialog, 'Jane at ACME')).getByRole('button', { name: 'Copy' }))
    const status = within(rowNamed(dialog, 'Jane at ACME')).getByRole('status').textContent
    expect(status).toContain('Could not copy')
    expect(status).not.toContain('Link copied')
  })

  it('renames with a PATCH that keeps the token, and may clear the name', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Jane at ACME')
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Who is it for?' })
    expect(field.value).toBe('Jane at ACME')
    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(actions.update).toHaveBeenCalledWith(P, JANE, { name: '' })
    expect(within(dialog).getAllByText('Unnamed link')).toHaveLength(2)
    const urls = within(dialog).getAllByRole<HTMLInputElement>('textbox', { name: 'Share URL for Unnamed link' })
    expect(urls.map((url) => url.value)).toContain(`${window.location.origin}/s/${JANE}`)
  })

  it('shows the name the server stored after a rename', async () => {
    const { actions, user } = renderManager()
    actions.update.mockResolvedValue({ ok: true, value: link({ name: 'Jane, as stored' }) })
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Jane at ACME')
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.type(screen.getByRole('textbox', { name: 'Who is it for?' }), ' typed{Enter}')
    expect(within(dialog).getByText('Jane, as stored')).toBeTruthy()
  })

  it('changes role with a PATCH, the current role disabled', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    const menu = await menuOf(user, dialog, 'Jane at ACME')
    expect(within(menu).getByRole('menuitem', { name: 'Set to read only' }).getAttribute('aria-disabled')).toBe('true')
    await user.click(within(menu).getByRole('menuitem', { name: 'Set to read & write' }))
    expect(actions.update).toHaveBeenCalledWith(P, JANE, { role: 'write' })
    expect(rowNamed(dialog, 'Jane at ACME').textContent).toContain('Read & write')
    expect(within(rowNamed(dialog, 'Jane at ACME')).getByRole<HTMLInputElement>('textbox').value).toContain(JANE)
  })

  it('revokes after a confirm that names the link, and drops the row', async () => {
    const { actions, user } = renderManager()
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Jane at ACME')
    await user.click(screen.getByRole('menuitem', { name: 'Revoke link' }))
    expect(screen.getByRole('heading', { name: 'Revoke “Jane at ACME”?' })).toBeTruthy()
    await user.keyboard('{Enter}')
    expect(actions.revoke).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(actions.revoke).toHaveBeenCalledWith(P, JANE)
    expect(within(dialog).queryByText('Jane at ACME')).toBeNull()
    expect(within(dialog).getByRole('status').textContent).toBe('Link revoked.')
  })

  it('asks "Revoke this link?" for an unnamed link, and says a manage link takes its children', async () => {
    const { user } = renderManager()
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Unnamed link')
    await user.click(screen.getByRole('menuitem', { name: 'Revoke link' }))
    expect(screen.getByRole('heading', { name: 'Revoke this link?' })).toBeTruthy()
    expect(document.body.textContent).toContain('and so does every link created with it')
  })

  it('drops every row a cascade took, and counts them', async () => {
    const { actions, user } = renderManager()
    actions.revoke.mockResolvedValue({ ok: true, value: [link({ token: BLANK, name: '' }), link()] })
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Unnamed link')
    await user.click(screen.getByRole('menuitem', { name: 'Revoke link' }))
    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(within(dialog).queryAllByTestId('link-row')).toEqual([])
    expect(within(dialog).getByRole('status').textContent).toBe('2 links revoked: this one and 1 created with it.')
  })

  it('shows a refused change rather than pretending it worked', async () => {
    const { actions, user } = renderManager()
    actions.update.mockResolvedValue({ ok: false, status: 409, detail: 'Someone else changed this link.' })
    const dialog = await opened(user)
    await menuOf(user, dialog, 'Jane at ACME')
    await user.click(screen.getByRole('menuitem', { name: 'Set to manage' }))
    expect(within(dialog).getByRole('alert').textContent).toBe('Someone else changed this link.')
    expect(rowNamed(dialog, 'Jane at ACME').textContent).toContain('Read only')
    expect(actions.update).toHaveBeenCalledTimes(1)
  })

  it('draws only the options controls allow', async () => {
    const { user } = renderManager({ controls: { read: true, create: true, update: false, revoke: true } })
    const dialog = await opened(user)
    const menu = await menuOf(user, dialog, 'Jane at ACME')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Revoke link'])
  })
})
