import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

const open = (overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      message="All of its tabs, content and share links are deleted. This cannot be undone."
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      title={'Delete “ACME Website”?'}
      {...overrides}
    />,
  )
  return { onCancel, onConfirm }
}

const confirmButton = () => screen.getByRole('button', { name: 'Confirm' })

describe('ConfirmDialog', () => {
  it('renders the quoted title and the consequence message', () => {
    open()
    expect(screen.getByText('Delete “ACME Website”?')).toBeTruthy()
    expect(
      screen.getByText(
        'All of its tabs, content and share links are deleted. This cannot be undone.',
      ),
    ).toBeTruthy()
  })

  it('autofocuses nothing in a destructive dialog, so Enter cannot confirm a delete', async () => {
    const { onConfirm } = open({ danger: true, confirmLabel: 'Delete project' })
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete project' }))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.keyboard('{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('leaves focus inside the dialog rather than on whatever opened it', () => {
    open({ danger: true })
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
  })

  it('relies on the dialog being programmatically focusable, which the primitive provides', () => {
    open({ danger: true })
    expect(screen.getByRole('dialog').getAttribute('tabindex')).toBe('-1')
  })

  it('focuses the confirm button of a non-destructive dialog, where Enter does confirm', async () => {
    const { onConfirm } = open()
    expect(document.activeElement).toBe(confirmButton())
    await userEvent.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('resolves the cancel branch on Escape, for both the safe and the destructive form', async () => {
    const safe = open()
    await userEvent.keyboard('{Escape}')
    expect(safe.onCancel).toHaveBeenCalledTimes(1)
    expect(safe.onConfirm).not.toHaveBeenCalled()
  })

  it('resolves the cancel branch on Escape in the destructive form too', async () => {
    const danger = open({ danger: true })
    await userEvent.keyboard('{Escape}')
    expect(danger.onCancel).toHaveBeenCalledTimes(1)
    expect(danger.onConfirm).not.toHaveBeenCalled()
  })

  it('resolves the cancel branch from the Cancel button', async () => {
    const { onCancel, onConfirm } = open({ danger: true })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms a destructive action only on a click, which is the one affordance legacy left', async () => {
    const { onConfirm } = open({ danger: true, confirmLabel: 'Delete project' })
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows no close affordance beyond Cancel, so there is one cancel path to test', () => {
    open({ danger: true })
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('paints the destructive confirm red and the safe one primary', () => {
    const { unmount } = render(
      <ConfirmDialog
        confirmLabel="Delete project"
        danger
        message="gone"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open
        title="Delete?"
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete project' }).className).toContain(
      'text-destructive',
    )
    unmount()
    open()
    expect(confirmButton().className).toContain('bg-primary')
  })

  it('renders nothing while closed', () => {
    render(
      <ConfirmDialog
        message="gone"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open={false}
        title="Delete?"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
