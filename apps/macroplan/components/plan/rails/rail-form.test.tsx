import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EPIC_1, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { RAIL_WORDS, RailForm } from './rail-form'
import { deleteWords } from './rail-fields'

const answered = { ok: true, value: atlasPlan() } as const

const setup = (over: Partial<Parameters<typeof RailForm>[0]> = {}) => {
  const rename = vi.fn().mockResolvedValue(answered)
  const recolour = vi.fn().mockResolvedValue(answered)
  const reorder = vi.fn().mockResolvedValue(answered)
  const remove = vi.fn().mockResolvedValue(answered)
  render(
    <RailForm
      colour="#3b82f6"
      epicId={EPIC_1}
      features={2}
      mayRecolour
      mayRemove
      mayRename
      mayReorder
      name="Platform"
      planId={PLAN_A}
      railOrder={0}
      recolour={recolour}
      remove={remove}
      rename={rename}
      reorder={reorder}
      {...over}
    />,
  )
  return { rename, recolour, reorder, remove, user: userEvent.setup() }
}

const nameField = () => screen.getByLabelText<HTMLInputElement>('Name of Platform')

const laneField = () => screen.getByLabelText<HTMLInputElement>('Lane of Platform')

describe('RailForm', () => {
  it('renames on blur rather than per keystroke, so one rename is one request', async () => {
    const { rename, user } = setup()
    await user.clear(nameField())
    await user.type(nameField(), 'Platform work')
    expect(rename).not.toHaveBeenCalled()
    await user.tab()
    expect(rename).toHaveBeenCalledExactlyOnceWith(PLAN_A, EPIC_1, 'Platform work')
  })

  it('sends nothing when the name is left as it was, an unchanged blur being no edit', async () => {
    const { rename, user } = setup()
    await user.click(nameField())
    await user.tab()
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuses an emptied name here and puts the stored one back, sending no request', async () => {
    const { rename, user } = setup()
    await user.clear(nameField())
    await user.tab()
    expect(rename).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(RAIL_WORDS.empty)
    expect(nameField().value).toBe('Platform')
  })

  it('moves the rail to the lane typed', async () => {
    const { reorder, user } = setup()
    await user.clear(laneField())
    await user.type(laneField(), '2')
    expect(reorder).toHaveBeenCalledWith(PLAN_A, EPIC_1, 2)
  })

  it('sends no lane for a cleared field, which Number would otherwise read as the top lane', async () => {
    const { reorder, user } = setup()
    await user.clear(laneField())
    expect(reorder).not.toHaveBeenCalled()
  })

  it('says in the delete what it would take with it, a rail cascading to its features', () => {
    setup()
    expect(screen.getByRole('button', { name: deleteWords(2) }).textContent).toContain('2 features')
  })

  it('offers a plain delete for an empty rail, there being nothing to warn about', () => {
    setup({ features: 0 })
    expect(screen.getByRole('button', { name: 'Delete rail' })).toBeTruthy()
  })

  it('draws the name as text and the hue as a dot for a reader refused the rename', () => {
    setup({ mayRecolour: false, mayRename: false })
    expect(screen.queryByLabelText('Name of Platform')).toBeNull()
    expect(screen.queryByLabelText('Colour of Platform')).toBeNull()
    expect(screen.getByText('Platform')).toBeTruthy()
  })

  it('draws no lane and no delete for a reader refused either', () => {
    setup({ mayRemove: false, mayReorder: false })
    expect(screen.queryByLabelText('Lane of Platform')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says the API’s own sentence when a write is refused', async () => {
    const { user } = setup({ remove: vi.fn().mockResolvedValue({ ok: false, status: 409, detail: 'In use' }) })
    await user.click(screen.getByRole('button', { name: deleteWords(2) }))
    expect((await screen.findByRole('alert')).textContent).toBe('In use')
  })

  it('says so when the server never answers, rather than throwing', async () => {
    const { user } = setup({ remove: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) })
    await user.click(screen.getByRole('button', { name: deleteWords(2) }))
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })
})
