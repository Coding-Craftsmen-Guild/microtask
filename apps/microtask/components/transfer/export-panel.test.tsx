import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPORT_ROUTE_PATH } from './paths'

const started: string[] = []

vi.mock('./download', () => ({
  startDownload: (url: string) => {
    started.push(url)
  },
}))

const { ExportPanel } = await import('./export-panel')

beforeEach(() => {
  started.length = 0
})

const open = (): void => {
  render(<ExportPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
}

const optIn = (): HTMLElement => screen.getByLabelText(/preserve share tokens/i)

const download = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
}

describe('the export dialog is where the credential half of a download is decided (ADR 0017)', () => {
  it('opens on the page button, with the opt-in off and the stripped notice showing', async () => {
    open()
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="stripped-notice"]')).not.toBeNull()
    })
    expect((optIn() as HTMLInputElement).checked).toBe(false)
  })

  it('warns in plaintext terms the moment the opt-in is switched on', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    fireEvent.click(optIn())
    expect(document.body.querySelector('[data-slot="token-warning"]')?.textContent).toContain(
      'live share tokens in plaintext',
    )
  })
})

describe('the download address carries the opt-in and nothing else', () => {
  it('sends no tokens parameter at all when the opt-in is off, so the API default strips', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    download()
    expect(started).toEqual([EXPORT_ROUTE_PATH])
    expect(started[0]).not.toContain('tokens')
  })

  it('never spells strip, since the API is the one authority on what a download carries', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    download()
    expect(started[0]).not.toContain('strip')
  })

  it('asks for preserve explicitly once the opt-in has been switched on', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    fireEvent.click(optIn())
    download()
    expect(started).toEqual([`${EXPORT_ROUTE_PATH}?tokens=preserve`])
  })

  it('starts nothing at all on Cancel', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    fireEvent.click(optIn())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(started).toEqual([])
  })

  it('forgets the opt-in after a cancel, so the next download is not silently a token dump', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    fireEvent.click(optIn())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    await waitFor(() => {
      expect((optIn() as HTMLInputElement).checked).toBe(false)
    })
    download()
    expect(started).toEqual([EXPORT_ROUTE_PATH])
  })

  it('forgets the opt-in after a download too, for the same reason', async () => {
    open()
    await waitFor(() => {
      expect(optIn()).not.toBeNull()
    })
    fireEvent.click(optIn())
    download()
    fireEvent.click(screen.getByRole('button', { name: 'Export…' }))
    await waitFor(() => {
      expect((optIn() as HTMLInputElement).checked).toBe(false)
    })
    download()
    expect(started).toEqual([`${EXPORT_ROUTE_PATH}?tokens=preserve`, EXPORT_ROUTE_PATH])
  })
})
