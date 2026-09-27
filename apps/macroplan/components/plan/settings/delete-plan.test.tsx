import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_A } from '../testing/plan-fixture'
import { DELETE_PLAN_MESSAGE, DeletePlan } from './delete-plan'

const setup = (remove = vi.fn().mockResolvedValue(undefined)) => {
  render(<DeletePlan name="Atlas" planId={PLAN_A} remove={remove} />)
  return { remove, user: userEvent.setup() }
}

const open = () => screen.getByRole('button', { name: 'Delete' })

// The trigger and the confirm carry **different** labels, which is what makes this query unambiguous:
// Radix marks the rest of the page `aria-hidden` while the modal is open, so two buttons sharing one
// label leaves exactly one match and no way to say which of them it is.
const confirm = () => screen.getByRole('button', { name: 'Delete plan' })

describe('DeletePlan', () => {
  it('asks before deleting, so one click cannot remove a plan', async () => {
    const { remove, user } = setup()
    await user.click(open())
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain(DELETE_PLAN_MESSAGE)
  })

  it('names the plan in the question, so nobody deletes the wrong one from a second tab', async () => {
    const { user } = setup()
    await user.click(open())
    expect(screen.getByRole('dialog').textContent).toContain('Atlas')
  })

  // The half nobody expects. The other three losses are the plan's own; a revoked seat is somebody
  // else's access disappearing without their being told, and the tokens stop resolving inside the same
  // locked write that removes the files — so there is no window in which one could be warned.
  it('says the share links stop working and that nobody holding one is told', async () => {
    const { user } = setup()
    await user.click(open())
    const said = screen.getByRole('dialog').textContent ?? ''
    expect(said).toContain('share link')
    expect(said).toContain('not told')
  })

  it('deletes once confirmed, naming the plan and nothing else', async () => {
    const { remove, user } = setup()
    await user.click(open())
    await user.click(confirm())
    expect(remove).toHaveBeenCalledExactlyOnceWith(PLAN_A)
  })

  // The shared dialog focuses nothing that confirms when it is `danger`, so Enter cannot delete a plan
  // and a click is the only way through. Reproduced from the app being replaced, and asserted here
  // because this component is what asks for `danger` — dropping that prop would lose it silently.
  it('focuses nothing that confirms, so Enter cannot delete a plan', async () => {
    const { user } = setup()
    await user.click(open())
    expect(document.activeElement).not.toBe(confirm())
  })

  it('deletes nothing when the question is dismissed', async () => {
    const { remove, user } = setup()
    await user.click(open())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()
  })

  // A refusal is said beside the button. Success says nothing, because success is a navigation: the
  // action redirects to the index, so this component is unmounted before it could render anything.
  it('says a refusal beside the button rather than leaving the page looking deleted', async () => {
    const { user } = setup(vi.fn().mockResolvedValue({ ok: false, status: 403, detail: 'Not yours' }))
    await user.click(open())
    await user.click(confirm())
    expect((await screen.findByRole('alert')).textContent).toBe('Not yours')
  })

  it('says something when the action answered nothing at all', async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error('offline')))
    await user.click(open())
    await user.click(confirm())
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })
})
