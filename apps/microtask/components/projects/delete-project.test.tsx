import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../actions/result'
import { DeleteProject } from './delete-project'

const P = '01HZZZZZZZZZZZZZZZZZZZZZZ1'

const setup = (answer: ActionResult<null> = { ok: true, value: null }) => {
  const onDelete = vi.fn<(projectId: string) => Promise<ActionResult<null>>>().mockResolvedValue(answer)
  render(<DeleteProject name="ACME Website" onDelete={onDelete} projectId={P} />)
  return { onDelete, user: userEvent.setup() }
}

describe('DeleteProject', () => {
  it('asks first, with the name in the title and what goes with it', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('heading', { name: 'Delete “ACME Website”?' })).toBeTruthy()
    expect(dialog.textContent).toContain(
      'All of its folders, tasks, tabs, content and share links are deleted. This cannot be undone.',
    )
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('focuses nothing that confirms, so Enter cannot delete', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete project' }))
    await user.keyboard('{Enter}')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes this project on confirm', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(onDelete).toHaveBeenCalledWith(P)
  })

  it('does nothing on cancel', async () => {
    const { onDelete, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says why when the delete is refused', async () => {
    const { user } = setup({ ok: false, status: 404, detail: 'Project not found' })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(screen.getByRole('alert').textContent).toBe('Project not found')
  })
})
