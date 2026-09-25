import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DragNotice, MOVED, type Said } from './drag-notice'

const BACK = { epicId: 'epic-1', position: 2 }

const said = (over: Partial<Said> = {}): Said => ({
  text: MOVED,
  featureId: 'feature-1',
  back: BACK,
  ...over,
})

afterEach(cleanup)

describe('the line under the canvas', () => {
  it('says nothing at all before anything has been dropped, rather than an empty container', () => {
    const { container } = render(<DragNotice said={null} undo={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('says what the drop did, politely rather than as an alert', () => {
    render(<DragNotice said={said()} undo={() => undefined} />)
    expect(screen.getByRole('status').textContent).toContain(MOVED)
  })

  it('offers the undo as a button, since it sends a write rather than navigating', () => {
    render(<DragNotice said={said()} undo={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('type')).toBe('button')
  })

  it('hands the undo the feature that moved and the place it held, and nothing else', () => {
    const undo = vi.fn()
    render(<DragNotice said={said()} undo={undo} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo.mock.calls).toEqual([['feature-1', BACK]])
  })

  it('draws no undo where there is nothing to take back, rather than a disabled one', () => {
    render(<DragNotice said={said({ back: null, text: 'Not permitted.' })} undo={() => undefined} />)
    expect(screen.getByRole('status').textContent).toBe('Not permitted.')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('says a refusal in the same line and not as an alert, a pointer gesture’s result interrupting nobody', () => {
    render(<DragNotice said={said({ back: null, text: 'Not permitted.' })} undo={() => undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
