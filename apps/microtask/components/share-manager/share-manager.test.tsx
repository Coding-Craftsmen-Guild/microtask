import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BLANK, JANE, links, P, renderManager, T1 } from './testing/share-fixture'

const openManager = async (user: ReturnType<typeof renderManager>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('dialog', { name: 'Share this project' })
}

describe('ShareManager', () => {
  it('shows the server-rendered count and fetches no links until it is opened', () => {
    const { actions, view } = renderManager({ count: 2 })
    expect(screen.getByText('2 share links')).toBeTruthy()
    expect(actions.list).not.toHaveBeenCalled()
    expect(view.container.innerHTML).not.toContain(JANE)
    expect(document.body.innerHTML).not.toContain(JANE)
  })

  it('shows no count when there are none, or when the caller was not told', () => {
    renderManager({ count: 0 })
    expect(screen.queryByText(/share link/)).toBeNull()
  })

  it('loads the links for this project when opened', async () => {
    const { actions, user } = renderManager()
    const dialog = await openManager(user)
    expect(actions.list).toHaveBeenCalledWith(P)
    expect(within(dialog).getByText('Jane at ACME')).toBeTruthy()
  })

  it('renders a blank name as "Unnamed link"', async () => {
    const { user } = renderManager()
    const dialog = await openManager(user)
    expect(within(dialog).getByText('Unnamed link')).toBeTruthy()
  })

  it('shows each link’s role and what it opens', async () => {
    const { user } = renderManager()
    const dialog = await openManager(user)
    const rows = within(dialog).getAllByTestId('link-row')
    expect(rows[0]?.textContent).toContain('Read only')
    expect(rows[0]?.textContent).toContain('Go-live')
    expect(rows[1]?.textContent).toContain('Manage')
    expect(rows[1]?.textContent).toContain('Whole project')
  })

  it('builds each URL on the origin this page was requested from', async () => {
    const { user } = renderManager()
    const dialog = await openManager(user)
    const urls = within(dialog).getAllByRole<HTMLInputElement>('textbox', { name: /Share URL/ })
    expect(urls.map((url) => url.value)).toEqual([
      `${window.location.origin}/s/${JANE}`,
      `${window.location.origin}/s/${BLANK}`,
    ])
    expect(urls.every((url) => url.readOnly)).toBe(true)
  })

  it('follows whatever origin the page is served from, rather than a hostname in the code', async () => {
    const happy = (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM
    happy.setURL(`https://tasks.example.com/p/${P}`)
    const { user } = renderManager()
    const dialog = await openManager(user)
    const [first] = within(dialog).getAllByRole<HTMLInputElement>('textbox', { name: /Share URL/ })
    expect(first?.value).toBe(`https://tasks.example.com/s/${JANE}`)
  })

  it('says so, verbatim, when there are no links', async () => {
    const { actions, user } = renderManager()
    actions.list.mockResolvedValue({ ok: true, value: [] })
    const dialog = await openManager(user)
    expect(within(dialog).getByText('No links yet — add one above.')).toBeTruthy()
  })

  it('says why the links could not load, and offers to try again', async () => {
    const { actions, user } = renderManager()
    actions.list.mockResolvedValueOnce({ ok: false, status: 403, detail: 'Not allowed.' })
    const dialog = await openManager(user)
    expect(within(dialog).getByRole('alert').textContent).toBe('Not allowed.')
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(actions.list).toHaveBeenCalledTimes(2)
    expect(within(dialog).getByText('Jane at ACME')).toBeTruthy()
  })

  it('forgets the links when closed, and asks again on the next open', async () => {
    const { actions, user } = renderManager()
    await openManager(user)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(document.body.innerHTML).not.toContain(JANE)
    await openManager(user)
    expect(actions.list).toHaveBeenCalledTimes(2)
  })

  it('drops a list that arrives after the dialog was closed, rather than holding its tokens', async () => {
    const { actions, user } = renderManager()
    let answer: (value: Awaited<ReturnType<typeof actions.list>>) => void = () => undefined
    actions.list.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    actions.list.mockReturnValueOnce(new Promise(() => undefined))
    await openManager(user)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await openManager(user)
    await act(async () => answer({ ok: true, value: links() }))
    expect(document.body.innerHTML).not.toContain(JANE)
    expect(screen.getByText('Loading links…')).toBeTruthy()
  })

  it('does not carry the stale legacy hint that nobody can add tabs', async () => {
    const { user } = renderManager()
    const dialog = await openManager(user)
    expect(dialog.textContent).not.toContain('Nobody can add, rename or delete tabs')
  })
})

describe('ShareManager, from capabilities', () => {
  it('draws nothing for a holder who can neither list nor create links', () => {
    renderManager({ controls: { read: false, create: false, update: false, revoke: false } })
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('never lists for a holder who can create but not list, and says so rather than failing', async () => {
    const { actions, user } = renderManager({ controls: { read: false, create: true, update: false, revoke: false } })
    const dialog = await openManager(user)
    expect(actions.list).not.toHaveBeenCalled()
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(dialog.textContent).toContain('You can create links here, but not list, rename or revoke them.')
  })

  it('shows a link just created by a create-only holder, with its URL and no options', async () => {
    const { actions, user } = renderManager({ controls: { read: false, create: true, update: false, revoke: false } })
    const dialog = await openManager(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Who is this link for?' }), 'Sam{Enter}')
    expect(actions.create).toHaveBeenCalledWith(P, { name: 'Sam', role: 'view', scope: { kind: 'task', projectId: P, taskId: T1 } })
    expect(within(dialog).getByText('Sam')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Link options' })).toBeNull()
  })

  it('shows a create-only holder’s new link once: closing the dialog drops it and its token', async () => {
    const { user } = renderManager({ controls: { read: false, create: true, update: false, revoke: false } })
    const dialog = await openManager(user)
    await user.type(within(dialog).getByRole('textbox', { name: 'Who is this link for?' }), 'Sam{Enter}')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    const reopened = await openManager(user)
    expect(within(reopened).queryByText('Sam')).toBeNull()
    expect(document.body.innerHTML).not.toContain('tok_NEWNEWNEWNEWNEWNEWNEWNE')
  })
})
