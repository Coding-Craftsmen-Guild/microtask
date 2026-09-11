import { capabilities } from '@repo/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ADMIN_CAPABILITIES } from '../shared/admin-capabilities'
import { fakeShareActions, P, T1 } from '../share-manager/testing/share-fixture'
import { TaskHeader } from './task-header'

const setup = (can = ADMIN_CAPABILITIES, count: number | undefined = 1) => {
  const share = fakeShareActions()
  render(<TaskHeader can={can} count={count} projectId={P} share={share} task={{ id: T1, name: 'Go-live' }} />)
  return { share, user: userEvent.setup() }
}

const opened = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Share' }))
  return screen.getByRole('dialog', { name: 'Share this task' })
}

describe('TaskHeader', () => {
  it('heads the page with the task’s name', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Go-live')
  })

  it('shows beside Share the count of links scoped to this task', () => {
    setup(ADMIN_CAPABILITIES, 1)
    expect(screen.getByText('1 share link')).toBeTruthy()
  })

  it('opens a manager scoped to this task, which asks for this task’s links only', async () => {
    const { share, user } = setup()
    await opened(user)
    expect(share.list).toHaveBeenCalledWith(P, T1)
  })

  it('offers to mint over this task and nothing wider', async () => {
    const { share, user } = setup()
    const dialog = await opened(user)
    const opens = within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Opens' })
    expect([...opens.options].map((option) => option.textContent)).toEqual(['Go-live'])
    await user.type(within(dialog).getByRole('textbox', { name: 'Who is this link for?' }), 'Jane{Enter}')
    expect(share.create).toHaveBeenCalledWith(P, { name: 'Jane', role: 'view', scope: { kind: 'task', projectId: P, taskId: T1 } })
  })

  it('draws no Share for a holder who can neither list nor mint', () => {
    setup(capabilities('write', { kind: 'task', projectId: P, taskId: T1 }))
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('gives a task-scoped manage holder a create-only manager, which never lists', async () => {
    const { share, user } = setup(capabilities('manage', { kind: 'task', projectId: P, taskId: T1 }), undefined)
    const dialog = await opened(user)
    expect(share.list).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Add link' })).toBeTruthy()
    expect(dialog.textContent).toContain('You can create links here, but not list, rename or revoke them.')
  })
})
