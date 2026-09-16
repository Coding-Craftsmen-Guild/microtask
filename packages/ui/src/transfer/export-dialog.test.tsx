import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './export-dialog'

const open = (preserveTokens: boolean) => {
  const onPreserveTokensChange = vi.fn()
  const onExport = vi.fn()
  const onCancel = vi.fn()
  render(
    <ExportDialog
      onCancel={onCancel}
      onExport={onExport}
      onPreserveTokensChange={onPreserveTokensChange}
      open
      preserveTokens={preserveTokens}
    />,
  )
  return { onCancel, onExport, onPreserveTokensChange }
}

const warning = () => document.querySelector('[data-slot="token-warning"]')
const stripped = () => document.querySelector('[data-slot="stripped-notice"]')

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

  it('downloads only when the download button is used, and cancels without exporting', async () => {
    const { onCancel, onExport } = open(true)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onExport.mock.calls.length).toBe(0)
    expect(onCancel.mock.calls.length).toBeGreaterThan(0)
  })
})
