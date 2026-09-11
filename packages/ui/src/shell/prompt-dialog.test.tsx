import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PromptDialog } from './prompt-dialog'

const open = (overrides: Partial<Parameters<typeof PromptDialog>[0]> = {}) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <PromptDialog
      defaultValue="General"
      label="Tab name"
      onCancel={onCancel}
      onSubmit={onSubmit}
      open
      submitLabel="Rename"
      title="Rename tab"
      {...overrides}
    />,
  )
  return { onCancel, onSubmit }
}

const field = () => screen.getByRole('textbox') as HTMLInputElement

describe('PromptDialog', () => {
  it('renders the title, the optional hint and the field label', () => {
    open({ hint: 'Who is it for?' })
    expect(screen.getByText('Rename tab')).toBeTruthy()
    expect(screen.getByText('Who is it for?')).toBeTruthy()
    expect(screen.getByLabelText('Tab name')).toBe(field())
  })

  it('omits the hint paragraph when no hint is given, as the share page prompt did', () => {
    open()
    expect(screen.queryByText('Who is it for?')).toBeNull()
  })

  it('focuses the input and text-selects it, so retyping replaces the whole name', async () => {
    const { onSubmit } = open()
    expect(document.activeElement).toBe(field())
    expect(field().selectionStart).toBe(0)
    expect(field().selectionEnd).toBe('General'.length)
    await userEvent.keyboard('Checklist{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Checklist')
  })

  it('submits the trimmed value on Enter', async () => {
    const { onSubmit } = open({ defaultValue: '' })
    await userEvent.type(field(), '  Notes  {Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Notes')
  })

  it('submits from the submit button too, with the caller label', async () => {
    const { onSubmit } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(onSubmit).toHaveBeenCalledWith('General')
  })

  it('refuses an empty value rather than submitting one', async () => {
    const { onSubmit } = open({ defaultValue: '' })
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses whitespace-only input, which trims to empty', async () => {
    const { onSubmit } = open({ defaultValue: '   ' })
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the empty string when allowEmpty, which is how a share link name is cleared', async () => {
    const { onSubmit } = open({ allowEmpty: true, defaultValue: 'Jane at ACME' })
    await userEvent.clear(field())
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('')
  })

  it('resolves the cancel branch on Escape, discarding what was typed', async () => {
    const { onCancel, onSubmit } = open()
    await userEvent.keyboard('Renamed{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('resolves the cancel branch from the Cancel button', async () => {
    const { onCancel, onSubmit } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('caps the field at legacy 200 characters, above the 80 the server truncates to', () => {
    open()
    expect(field().getAttribute('maxlength')).toBe('200')
  })

  it('carries the caller placeholder', () => {
    open({ defaultValue: '', placeholder: 'Jane at ACME' })
    expect(field().getAttribute('placeholder')).toBe('Jane at ACME')
  })

  it('reseeds the field from defaultValue each time it opens, so a cancelled edit does not stick', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <PromptDialog
        defaultValue="General"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        open
        title="Rename tab"
      />,
    )
    await userEvent.keyboard('Scratch')
    rerender(
      <PromptDialog
        defaultValue="General"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        open={false}
        title="Rename tab"
      />,
    )
    rerender(
      <PromptDialog
        defaultValue="General"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        open
        title="Rename tab"
      />,
    )
    expect(field().value).toBe('General')
  })

  it('renders nothing while closed', () => {
    open({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
