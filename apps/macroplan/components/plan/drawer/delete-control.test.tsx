import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { DELETE_FEATURE, DELETE_ITEM, type SubjectRemove } from './field'
import type { SubjectKind } from './values'

const replaced: string[] = []

const pushed: string[] = []

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
    push: (href: string) => {
      pushed.push(href)
    },
    refresh: () => undefined,
    replace: (href: string) => {
      replaced.push(href)
    },
  }),
}))

const { DeleteControl } = await import('./delete-control')

const CLOSE = `/plans/${PLAN_A}`

const served: ActionResult<Plan> = { ok: true, value: atlasPlan() }

interface Open {
  readonly kind?: SubjectKind
  readonly name?: string
  readonly subjectId?: string
  readonly answer?: ActionResult<Plan>
  readonly remove?: SubjectRemove
}

const open = (over: Open = {}) => {
  replaced.length = 0
  pushed.length = 0
  const remove = vi.fn<SubjectRemove>(over.remove ?? (() => Promise.resolve(over.answer ?? served)))
  render(
    <DeleteControl
      closeHref={CLOSE}
      kind={over.kind ?? 'feature'}
      name={over.name ?? 'Auth rewrite'}
      planId={PLAN_A}
      remove={remove}
      subjectId={over.subjectId ?? FEATURE_1}
    />,
  )
  return { remove, user: userEvent.setup() }
}

const ask = async (over: Open = {}) => {
  const view = open(over)
  await view.user.click(screen.getByRole('button', { name: 'Delete' }))
  return view
}

describe('the delete a drawer offers, which asks before it does anything', () => {
  it('draws one Delete and sends nothing until it is confirmed', async () => {
    const { remove } = await ask()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(remove).not.toHaveBeenCalled()
  })

  it('names the subject in the question, so a reader is told which one is going', async () => {
    await ask({ name: 'Auth rewrite' })
    expect(screen.getByRole('heading', { name: 'Delete “Auth rewrite”?' })).toBeTruthy()
  })

  it('names what goes with a feature, and says the undo it does not have', async () => {
    await ask()
    expect(screen.getByRole('dialog').textContent).toContain(DELETE_FEATURE)
    expect(DELETE_FEATURE).toContain('This cannot be undone.')
  })

  it('names what goes with an item, whose one possession is the file its description is in', async () => {
    await ask({ kind: 'item', name: 'Sessions', subjectId: ITEM_1 })
    expect(screen.getByRole('dialog').textContent).toContain(DELETE_ITEM)
    expect(DELETE_ITEM).toContain('This cannot be undone.')
  })

  it('labels the confirm for the kind, the two sitting behind two different writes', async () => {
    await ask()
    expect(screen.getByRole('button', { name: 'Delete feature' })).toBeTruthy()
    screen.getByRole('button', { name: 'Cancel' }).click()
  })

  it('labels it for an item too', async () => {
    await ask({ kind: 'item', subjectId: ITEM_1 })
    expect(screen.getByRole('button', { name: 'Delete item' })).toBeTruthy()
  })

  it('does nothing on cancel, and closes', async () => {
    const { remove, user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(replaced).toEqual([])
  })
})

// The asymmetry `ConfirmDialog` is built for, asserted here rather than only where the dialog lives:
// `danger` moves focus to the dialog **body** instead of the confirm button, so the browser has nothing
// focused that Enter would activate. A delete that a stray Enter could commit is the one refusal this
// control cannot take back.
describe('the destructive dialog, where Enter is not a way through', () => {
  it('focuses the dialog itself rather than anything that confirms', async () => {
    await ask()
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete feature' }))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('sends no delete for an Enter pressed on the open dialog', async () => {
    const { remove, user } = await ask()
    await user.keyboard('{Enter}')
    expect(remove).not.toHaveBeenCalled()
    expect(replaced).toEqual([])
  })

  it('paints the confirm as destructive, so the colour and the focus say the same thing', async () => {
    await ask()
    expect(
      screen.getByRole('button', { name: 'Delete feature' }).getAttribute('data-variant'),
    ).toBe('destructive')
  })
})

describe('the delete itself, and the page a drawer over a deleted thing has to leave', () => {
  it('sends this plan and this subject, and nothing else there is to send', async () => {
    const { remove, user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(remove).toHaveBeenCalledWith(PLAN_A, FEATURE_1)
    expect(remove.mock.calls[0]?.length).toBe(2)
  })

  it('sends the item write for an item, the two ids being strings the compiler cannot tell apart', async () => {
    const { remove, user } = await ask({ kind: 'item', subjectId: ITEM_1 })
    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(remove).toHaveBeenCalledWith(PLAN_A, ITEM_1)
  })

  // A drawer left open over a deleted subject 404s on its next read: the page resolves through the row
  // and calls `notFound()` for an id the plan no longer holds. So the answer to a delete is the plan's
  // own no-selection page, and `refresh()` — which the action already asked for — is not that.
  it('goes to the plan’s own page on success, which is the address the drawer closes to', async () => {
    const { user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(replaced).toEqual([CLOSE])
  })

  // Replace and not push: pushing would leave the deleted drawer's URL one Back away, and Back is the
  // gesture a user reaches for straight after a delete they are checking on.
  it('replaces the drawer’s history entry rather than pushing a second one over it', async () => {
    const { user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(pushed).toEqual([])
  })

  it('takes the destination as a prop, so the seat surface cannot be sent to an admin path', async () => {
    const { user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(replaced[0]).toBe(CLOSE)
    expect(replaced[0]).not.toContain('login')
  })

  it('closes the dialog before the write, so the question is not left standing over it', async () => {
    const { user } = await ask()
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a delete the API refused, and one the server never answered', () => {
  it('says the sentence it came back with and stays where it is', async () => {
    const { user } = await ask({ answer: { ok: false, status: 403, detail: 'Not permitted: feature:delete' } })
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:delete')
    expect(replaced).toEqual([])
  })

  it('says so rather than leaving the rejection unhandled, and stays where it is', async () => {
    const { user } = await ask({ remove: () => Promise.reject(new TypeError('Failed to fetch')) })
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(replaced).toEqual([])
  })

  it('leaves no refusal on screen before anything has been sent', () => {
    open()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
