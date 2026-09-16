import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './export-dialog'

const open = (preserveTokens: boolean) => {
  const onPreserveTokensChange = vi.fn()
  const onExport = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <ExportDialog
      onCancel={onCancel}
      onExport={onExport}
      onPreserveTokensChange={onPreserveTokensChange}
      open
      preserveTokens={preserveTokens}
    />,
  )
  return { onCancel, onExport, onPreserveTokensChange, view }
}

const warning = () => document.querySelector('[data-slot="token-warning"]')
const stripped = () => document.querySelector('[data-slot="stripped-notice"]')
const download = () => screen.getByRole('button', { name: 'Download' })

describe('ExportDialog', () => {
  it('warns that the file will carry live tokens in plaintext once preserving is selected', () => {
    open(true)
    expect(warning()?.textContent).toContain('live share tokens in plaintext')
  })

  it('says the tokens cannot be taken back by deleting the file, which is what makes it a dump', () => {
    open(true)
    expect(warning()?.textContent).toContain('deleting the file does not revoke them')
  })

  it('does not warn while tokens are being stripped, so the warning means the setting is on', () => {
    open(false)
    expect(warning()).toBeNull()
    expect(stripped()?.textContent).toContain('omitted from the file')
  })

  it('leaves the opt-in off unless the caller says otherwise, because stripping is the default', () => {
    open(false)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('reports the opt-in being switched on rather than deciding for itself', async () => {
    const { onPreserveTokensChange } = open(false)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onPreserveTokensChange.mock.calls).toEqual([[true]])
  })

  it('reports the opt-in being switched back off', async () => {
    const { onPreserveTokensChange } = open(true)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onPreserveTokensChange.mock.calls).toEqual([[false]])
  })

  it('explains, before any choice is made, why a download leaves share links out', () => {
    open(false)
    expect(document.body.textContent).toContain('credential dump')
  })

  it('downloads when the Download button is used, which is the whole point of the dialog', async () => {
    const { onCancel, onExport } = open(false)
    await userEvent.click(download())
    expect(onExport.mock.calls.length).toBe(1)
    expect(onCancel.mock.calls.length).toBe(0)
  })

  it('downloads under the preserving setting too, so the opt-in does not disarm the button', async () => {
    const { onExport } = open(true)
    await userEvent.click(download())
    expect(onExport.mock.calls.length).toBe(1)
  })

  it('cancels without downloading when the Cancel button is used', async () => {
    const { onCancel, onExport } = open(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onExport.mock.calls.length).toBe(0)
    expect(onCancel.mock.calls.length).toBe(1)
  })

  it('resolves the cancel branch on Escape, so the modal cannot get stuck open', async () => {
    const { onCancel, onExport } = open(true)
    await userEvent.keyboard('{Escape}')
    expect(onCancel.mock.calls.length).toBe(1)
    expect(onExport.mock.calls.length).toBe(0)
  })

  it('holds no setting of its own, so what it shows is what the caller will export', () => {
    const { view } = open(false)
    expect(warning()).toBeNull()
    view.rerender(
      <ExportDialog
        onCancel={vi.fn()}
        onExport={vi.fn()}
        onPreserveTokensChange={vi.fn()}
        open
        preserveTokens
      />,
    )
    expect(warning()).not.toBeNull()
    expect(stripped()).toBeNull()
  })

  it('focuses nothing actionable on open, so a keystroke cannot switch the opt-in on', () => {
    open(false)
    expect(document.activeElement).not.toBe(screen.getByRole('checkbox'))
    expect(document.activeElement).not.toBe(download())
    expect(document.activeElement?.getAttribute('data-slot')).toBe('dialog-content')
  })
})
