import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CONFLICT_COST, CONFLICT_TEXT, SAVE_TEXT, SaveIndicator } from './save-indicator'
import type { SaveState } from './save-document'

afterEach(cleanup)

const show = (state: SaveState, message = '', onReload = (): void => undefined) =>
  render(<SaveIndicator message={message} onReload={onReload} state={state} />)

describe('the three texts legacy showed', () => {
  it('says Saving while a write is pending', () => {
    show('saving')
    expect(screen.getByRole('status').textContent).toBe(SAVE_TEXT.saving)
    expect(SAVE_TEXT.saving).toBe('Saving…')
  })

  it('says Saved once it lands', () => {
    show('saved')
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })

  it('says it is retrying, and what the server said, on a failure', () => {
    show('retrying', 'Network down')
    expect(screen.getByRole('status').textContent).toContain('Not saved — retrying…')
    expect(screen.getByRole('status').textContent).toContain('Network down')
  })

  it('says nothing at all when idle, which is the blank on a tab switch', () => {
    show('idle')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('is a live region, so the state is not visual only', () => {
    show('saving')
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })
})

describe('a conflict is surfaced, not hidden', () => {
  it('says someone else saved this tab', () => {
    show('conflict')
    expect(screen.getByRole('alert').textContent).toContain(CONFLICT_TEXT)
    expect(CONFLICT_TEXT).toBe('Someone else saved this tab')
  })

  it('says what a reload will cost before it is chosen, which ADR 0016 asks for', () => {
    show('conflict')
    expect(screen.getByRole('alert').textContent).toContain(CONFLICT_COST)
    expect(CONFLICT_COST).toBe('Reloading discards your unsaved edits.')
  })

  it('offers a reload the user has to choose, so nothing is discarded behind their back', () => {
    const onReload = vi.fn()
    show('conflict', '', onReload)
    screen.getByRole('button', { name: 'Reload this tab' }).click()
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('never claims to be retrying, a 409 being the one outcome that is not retried', () => {
    show('conflict')
    expect(document.body.textContent).not.toContain('retrying')
  })

  it('offers no reload in any state that is not a conflict', () => {
    for (const state of ['idle', 'saving', 'saved', 'retrying'] as const) {
      cleanup()
      show(state, 'Network down')
      expect(screen.queryByRole('button')).toBe(null)
      expect(screen.queryByRole('alert')).toBe(null)
    }
  })
})
