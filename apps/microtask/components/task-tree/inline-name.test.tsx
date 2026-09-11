import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../actions/result'
import { NO_ANSWER } from '../shared/no-answer'
import { InlineName } from './inline-name'

type Rename = (name: string) => Promise<ActionResult<string>>

const stored = (value: string): ReturnType<Rename> => Promise.resolve({ ok: true, value })

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Project name' })

const setup = (rename: Rename = (name) => stored(name), name = 'Alpha') => {
  const onRename = vi.fn(rename)
  const view = render(<InlineName label="Project name" name={name} onRename={onRename} />)
  return { onRename, view, user: userEvent.setup() }
}

describe('InlineName', () => {
  it('commits on Enter, sending the name with its whitespace collapsed', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), '  Beta    Co {Enter}')
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith('Beta Co')
  })

  it('commits on blur too', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Gamma')
    await user.tab()
    expect(onRename).toHaveBeenCalledWith('Gamma')
  })

  it('shows the name the server stored, not the one typed', async () => {
    const { user } = setup(() => stored('What the server kept'))
    await user.clear(field())
    await user.type(field(), 'Typed{Enter}')
    expect(field().value).toBe('What the server kept')
  })

  it('reverts on Escape and sends nothing', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Discarded{Escape}')
    expect(field().value).toBe('Alpha')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('restores silently, with no request, when the field is emptied', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), '   {Enter}')
    expect(field().value).toBe('Alpha')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('restores silently, with no request, when the name is unchanged once collapsed', async () => {
    const { onRename, user } = setup()
    await user.type(field(), '   {Enter}')
    expect(field().value).toBe('Alpha')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('never overwrites the field while the user is typing in it', async () => {
    const { view, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Half-typ')
    view.rerender(<InlineName label="Project name" name="Renamed elsewhere" onRename={vi.fn()} />)
    expect(field().value).toBe('Half-typ')
  })

  it('takes a new name from a re-render while the field is not focused', () => {
    const { view } = setup()
    view.rerender(<InlineName label="Project name" name="Renamed elsewhere" onRename={vi.fn()} />)
    expect(field().value).toBe('Renamed elsewhere')
  })

  it('does not overwrite what the user started typing while the rename was in flight', async () => {
    let answer: (result: ActionResult<string>) => void = () => undefined
    const { user } = setup(() => new Promise((resolve) => (answer = resolve)))
    await user.clear(field())
    await user.type(field(), 'First{Enter}')
    await user.click(field())
    await user.type(field(), ' and more')
    await act(async () => answer({ ok: true, value: 'First' }))
    expect(field().value).toBe('First and more')
  })

  it('restores the stored name and says why when the server refuses', async () => {
    const { user } = setup(() => Promise.resolve({ ok: false, status: 409, detail: 'Someone else renamed it.' }))
    await user.clear(field())
    await user.type(field(), 'Mine{Enter}')
    expect(field().value).toBe('Alpha')
    expect(screen.getByRole('alert').textContent).toBe('Someone else renamed it.')
  })

  it('clears the refusal once a later rename succeeds', async () => {
    const answers = [{ ok: false, status: 403, detail: 'No.' } as const, { ok: true, value: 'Yes' } as const]
    const { user } = setup(() => Promise.resolve(answers.shift() ?? { ok: true, value: 'x' }))
    await user.clear(field())
    await user.type(field(), 'One{Enter}')
    await user.clear(field())
    await user.type(field(), 'Yes{Enter}')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('restores the stored name and says so when the server never answers, leaving no rejection unhandled', async () => {
    const onDone = vi.fn()
    const onRename = vi.fn<Rename>(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<InlineName label="Project name" name="Alpha" onDone={onDone} onRename={onRename} />)
    const user = userEvent.setup()
    await user.clear(field())
    await user.type(field(), 'Mine{Enter}')
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', NO_ANSWER.detail)
    expect(field().value).toBe('Alpha')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('caps what can be typed at the name length the API accepts', () => {
    setup()
    expect(field().maxLength).toBe(80)
  })
})
