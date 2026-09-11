import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CONFLICT_COST, CONFLICT_TEXT, REFUSED_COST, SAVE_TEXT } from './save-copy'
import { SaveIndicator } from './save-indicator'
import type { SaveState } from './save-document'

afterEach(cleanup)

const show = (state: SaveState, message = '', onReload = (): void => undefined, onRetry = (): void => undefined) =>
  render(<SaveIndicator message={message} onReload={onReload} onRetry={onRetry} state={state} />)

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

  it('adds no dangling separator when a failure came with no message', () => {
    show('retrying', '')
    expect(screen.getByRole('status').textContent).toBe('Not saved — retrying…')
  })

  it('says nothing at all when idle, which is the blank on a tab switch', () => {
    show('idle')
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows a failure message only beside the retry text, never beside Saving or Saved', () => {
    for (const state of ['saving', 'saved'] as const) {
      cleanup()
      show(state, 'Network down')
      expect(screen.getByRole('status').textContent).toBe(SAVE_TEXT[state])
    }
  })

  it('colours the retry text as a failure, and Saving and Saved not', () => {
    const tone = (state: SaveState): boolean => {
      cleanup()
      show(state)
      return screen.getByRole('status').classList.contains('text-destructive')
    }
    expect(tone('retrying')).toBe(true)
    expect(tone('saving')).toBe(false)
    expect(tone('saved')).toBe(false)
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
    for (const state of ['idle', 'saving', 'saved', 'retrying', 'refused'] as const) {
      cleanup()
      show(state, 'Network down')
      expect(screen.queryByRole('button', { name: 'Reload this tab' })).toBe(null)
    }
  })

  it('offers no button and no alert while saving, saved, idle or retrying', () => {
    for (const state of ['idle', 'saving', 'saved', 'retrying'] as const) {
      cleanup()
      show(state, 'Network down')
      expect(screen.queryByRole('button')).toBe(null)
      expect(screen.queryByRole('alert')).toBe(null)
    }
  })
})

describe('a refusal no retry can change is said plainly, and retried only when asked', () => {
  const GONE = 'This share link is no longer available.'

  it('says Not saved, and never that it is retrying', () => {
    show('refused', GONE)
    expect(screen.getByRole('status').textContent).toBe('Not saved')
    expect(screen.getByRole('status').classList.contains('text-destructive')).toBe(true)
    expect(document.body.textContent).not.toContain('retrying')
  })

  it('says why, in the route’s own words, and that the edits stay here to be copied out', () => {
    show('refused', GONE)
    expect(screen.getByRole('alert').textContent).toContain(GONE)
    expect(screen.getByRole('alert').textContent).toContain(REFUSED_COST)
    expect(REFUSED_COST).toBe('Your edits stay in this tab until you leave the page, so copy out anything you need.')
  })

  it('offers a retry the user has to choose, since nothing will try on its own', () => {
    const onRetry = vi.fn()
    show('refused', GONE, undefined, onRetry)
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry in any other state', () => {
    for (const state of ['idle', 'saving', 'saved', 'retrying', 'conflict'] as const) {
      cleanup()
      show(state, GONE)
      expect(screen.queryByRole('button', { name: 'Try again' })).toBe(null)
    }
  })
})
