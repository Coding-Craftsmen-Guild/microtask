import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_A, SEAT_TOKEN, MANAGE_SEAT_TOKEN, WRITE_SEAT_TOKEN } from '../testing/plan-fixture'
import {
  COPIED,
  COPY_FAILED,
  LOADING_SEATS,
  NEEDS_A_NAME,
  NOTHING_TO_SAVE,
  NO_SEATS,
  SEAT_CREATED,
  SEAT_REVOKED,
  SHARE_HINT,
} from './seat-words'
import {
  MINTED_TOKEN,
  renderManager,
  seatDoubles,
  seatsOnAtlas,
  type ManagerSetup,
} from './testing/seat-doubles'

const EVERY_TOKEN = [SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN]

const NOTHING_DRAWN = { read: false, create: false, update: false, revoke: false }

const READ_ONLY = { read: true, create: false, update: false, revoke: false }

const clipboardTakes = (writeText: () => Promise<void>) =>
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)

const open = async (setup: ManagerSetup = {}) => {
  const view = renderManager(setup)
  await view.user.click(screen.getByRole('button', { name: 'Share' }))
  return { ...view, dialog: screen.getByRole('dialog', { name: 'Share this plan' }) }
}

const rows = (dialog: HTMLElement): readonly HTMLElement[] => within(dialog).getAllByTestId('seat-row')

const rowFor = (dialog: HTMLElement, name: string): HTMLElement => {
  const found = rows(dialog).find((row) => row.textContent?.includes(name) === true)
  if (found === undefined) throw new Error(`no row for ${name}`)
  return found
}

const urlField = (row: HTMLElement): HTMLInputElement => {
  const found = within(row).getByRole('textbox', { name: /Share URL/ })
  if (!(found instanceof HTMLInputElement)) throw new Error('the URL is not an input')
  return found
}

const mint = async (dialog: HTMLElement, name: string) => {
  const user = userEvent.setup()
  if (name !== '') await user.type(within(dialog).getByRole('textbox', { name: /Who is this seat for/ }), name)
  await user.click(within(dialog).getByRole('button', { name: 'Add seat' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the closed manager is, and what it is not', () => {
  it('draws the Share button, asks for nothing, and holds no token of this plan', () => {
    const { actions, view } = renderManager()
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(actions.list).not.toHaveBeenCalled()
    for (const token of EVERY_TOKEN) {
      expect(view.container.innerHTML).not.toContain(token)
      expect(document.body.innerHTML).not.toContain(token)
    }
  })

  it('draws nothing at all for a seat that may neither list nor mint, which is every non-manage seat', () => {
    renderManager({ controls: NOTHING_DRAWN })
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })
})

describe('the seats, fetched when it opens', () => {
  it('asks for this plan’s seats on open and names each one with its role', async () => {
    const { actions, dialog } = await open()
    expect(actions.list).toHaveBeenCalledWith(PLAN_A)
    expect(rows(dialog)).toHaveLength(3)
    expect(rowFor(dialog, 'Dana').textContent).toContain('Read only')
    expect(rowFor(dialog, 'Ivo').textContent).toContain('Read & write')
    expect(rowFor(dialog, 'Ravi').textContent).toContain('Manage')
  })

  it('says what the three roles may do, in this product’s own nouns', async () => {
    const { dialog } = await open()
    expect(dialog.textContent).toContain(SHARE_HINT)
    expect(dialog.textContent).not.toContain('tabs')
  })

  it('forgets every seat when Done is clicked, and asks again on the next open', async () => {
    const { actions, user } = await open()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    for (const token of EVERY_TOKEN) expect(document.body.innerHTML).not.toContain(token)
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(actions.list).toHaveBeenCalledTimes(2)
  })

  it('forgets them on Escape too, the native dismissal being a close like any other', async () => {
    const { user } = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const token of EVERY_TOKEN) expect(document.body.innerHTML).not.toContain(token)
  })

  it('drops a list that arrives after it was closed, rather than putting its tokens back on screen', async () => {
    const actions = seatDoubles()
    let answer: (value: Awaited<ReturnType<typeof actions.list>>) => void = () => undefined
    vi.mocked(actions.list).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    vi.mocked(actions.list).mockReturnValueOnce(new Promise(() => undefined))
    const { user } = await open({ actions })
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Share' }))
    await act(async () => {
      answer({ ok: true, value: seatsOnAtlas() })
    })
    for (const token of EVERY_TOKEN) expect(document.body.innerHTML).not.toContain(token)
    expect(screen.getByText(LOADING_SEATS)).toBeTruthy()
  })

  it('says why a refused list is empty and asks again on Try again', async () => {
    const actions = seatDoubles()
    vi.mocked(actions.list).mockResolvedValueOnce({
      ok: false,
      status: 403,
      detail: 'You are not allowed to make that change.',
    })
    const { dialog, user } = await open({ actions })
    expect(within(dialog).getByRole('alert').textContent).toContain('not allowed')
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(actions.list).toHaveBeenCalledTimes(2)
    expect(rows(dialog)).toHaveLength(3)
  })

  it('says a plan has no seats where the list comes back empty', async () => {
    const actions = seatDoubles()
    vi.mocked(actions.list).mockResolvedValueOnce({ ok: true, value: [] })
    const { dialog } = await open({ actions })
    expect(within(dialog).getByText(NO_SEATS)).toBeTruthy()
  })
})

describe('the URL, which is what a seat is handed out as', () => {
  it('shows each seat’s whole URL on this page’s own origin, read-only, and never a bare token', async () => {
    const { dialog } = await open()
    const fields = rows(dialog).map((row) => urlField(row))
    expect(fields.map((field) => field.value)).toEqual(
      EVERY_TOKEN.map((token) => `${window.location.origin}/s/${token}`),
    )
    expect(fields.every((field) => field.readOnly)).toBe(true)
  })

  it('puts that URL on the clipboard and says it went, rather than saying so unconditionally', async () => {
    const { dialog, user } = await open()
    const writeText = vi.fn(() => Promise.resolve())
    clipboardTakes(writeText)
    const row = rowFor(dialog, 'Ravi')
    await user.click(within(row).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/${MANAGE_SEAT_TOKEN}`)
    expect(within(row).getByText(COPIED)).toBeTruthy()
  })

  it('says a copy failed, the URL being selected so Ctrl+C is still offered', async () => {
    const { dialog, user } = await open()
    clipboardTakes(() => Promise.reject(new Error('denied')))
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
    const row = rowFor(dialog, 'Dana')
    await user.click(within(row).getByRole('button', { name: 'Copy' }))
    expect(within(row).getByText(COPY_FAILED)).toBeTruthy()
  })
})

describe('minting a seat', () => {
  it('sends the name and the role and puts the minted seat in the list with its URL', async () => {
    const { actions, dialog } = await open()
    await mint(dialog, 'Pia')
    expect(actions.create).toHaveBeenCalledWith(PLAN_A, { name: 'Pia', role: 'view' })
    const row = rowFor(dialog, 'Pia')
    expect(urlField(row).value).toBe(`${window.location.origin}/s/${MINTED_TOKEN}`)
    expect(within(dialog).getByRole('status').textContent).toBe(SEAT_CREATED)
  })

  it('offers no scope to choose, a plan having exactly one and the path already naming it', async () => {
    const { dialog } = await open()
    expect(within(dialog).queryByRole('combobox', { name: 'Opens' })).toBeNull()
    expect(dialog.textContent).not.toContain('Whole plan')
  })

  it('refuses a nameless mint in the form, sending nothing at all', async () => {
    const { actions, dialog } = await open()
    await mint(dialog, '')
    expect(actions.create).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert').textContent).toBe(NEEDS_A_NAME)
  })

  it('draws no mint form for a surface that may list but not mint', async () => {
    const { dialog } = await open({ controls: READ_ONLY })
    expect(within(dialog).queryByRole('button', { name: 'Add seat' })).toBeNull()
    expect(rows(dialog)).toHaveLength(3)
  })
})

describe('renaming a seat and re-roling it', () => {
  it('sends the new name alone, the token staying what the holder has bookmarked', async () => {
    const { actions, dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Ivo')).getByRole('button', { name: 'Rename' }))
    const prompt = screen.getByRole('dialog', { name: 'Name this seat' })
    await user.clear(within(prompt).getByRole('textbox'))
    await user.type(within(prompt).getByRole('textbox'), 'Ivo at ACME')
    await user.click(within(prompt).getByRole('button', { name: 'Save' }))
    expect(actions.update).toHaveBeenCalledWith(PLAN_A, WRITE_SEAT_TOKEN, { name: 'Ivo at ACME' })
    expect(rowFor(dialog, 'Ivo at ACME')).toBeTruthy()
  })

  it('refuses an edit that would change nothing, rather than letting the API answer 200 to it', async () => {
    const { actions, dialog, user } = await open()
    const row = rowFor(dialog, 'Ivo')
    await user.click(within(row).getByRole('button', { name: 'Rename' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Name this seat' })).getByRole('button', { name: 'Save' }),
    )
    expect(actions.update).not.toHaveBeenCalled()
    expect(within(row).getByText(NOTHING_TO_SAVE)).toBeTruthy()
  })

  it('allows a name cleared to nothing, which the payload admits and the list words', async () => {
    const { actions, dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Dana')).getByRole('button', { name: 'Rename' }))
    const prompt = screen.getByRole('dialog', { name: 'Name this seat' })
    await user.clear(within(prompt).getByRole('textbox'))
    await user.click(within(prompt).getByRole('button', { name: 'Save' }))
    expect(actions.update).toHaveBeenCalledWith(PLAN_A, SEAT_TOKEN, { name: '' })
    expect(rowFor(dialog, 'Unnamed seat')).toBeTruthy()
  })

  it('sends a role change alone, chosen from the three the product has', async () => {
    const { actions, dialog, user } = await open()
    const select = within(rowFor(dialog, 'Dana')).getByRole('combobox', { name: /Access for/ })
    await user.selectOptions(select, 'manage')
    expect(actions.update).toHaveBeenCalledWith(PLAN_A, SEAT_TOKEN, { role: 'manage' })
  })

  it('draws neither control for a surface that may only list', async () => {
    const { dialog } = await open({ controls: READ_ONLY })
    expect(within(dialog).queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(within(dialog).queryByRole('combobox', { name: /Access for/ })).toBeNull()
  })
})

describe('revoking a seat', () => {
  it('warns before the write that the whole lineage goes, there being nothing to report after it', async () => {
    const { dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Ravi')).getByRole('button', { name: 'Revoke' }))
    const confirm = screen.getByRole('dialog', { name: 'Revoke “Ravi”?' })
    expect(confirm.textContent).toContain('every seat minted through it')
    expect(confirm.textContent).toContain('cannot list those afterwards')
  })

  it('says only what is true of a seat that can mint nothing', async () => {
    const { dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Dana')).getByRole('button', { name: 'Revoke' }))
    const confirm = screen.getByRole('dialog', { name: 'Revoke “Dana”?' })
    expect(confirm.textContent).toContain('loses access immediately')
    expect(confirm.textContent).not.toContain('minted through it')
  })

  it('revokes on confirm, drops the row, and claims no count of what went with it', async () => {
    const { actions, dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Ravi')).getByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke seat' }))
    expect(actions.revoke).toHaveBeenCalledWith(PLAN_A, MANAGE_SEAT_TOKEN)
    expect(rows(dialog)).toHaveLength(2)
    expect(document.body.innerHTML).not.toContain(MANAGE_SEAT_TOKEN)
    const notice = within(dialog).getByRole('status').textContent ?? ''
    expect(notice).toBe(SEAT_REVOKED)
    expect(notice).not.toMatch(/[0-9]/)
  })

  it('sends nothing when the question is cancelled', async () => {
    const { actions, dialog, user } = await open()
    await user.click(within(rowFor(dialog, 'Ravi')).getByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(actions.revoke).not.toHaveBeenCalled()
    expect(rows(dialog)).toHaveLength(3)
  })

  it('draws no Revoke for a surface that may not revoke', async () => {
    const { dialog } = await open({ controls: READ_ONLY })
    expect(within(dialog).queryByRole('button', { name: 'Revoke' })).toBeNull()
  })
})
