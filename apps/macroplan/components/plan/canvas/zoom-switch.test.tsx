import type { Rung } from '@repo/canvas'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZoomSwitch } from './zoom-switch'
import { ZOOM_ORDER, ZOOM_WORDS } from './zoom-view'

afterEach(cleanup)

const nowhere = (): void => undefined

const buttons = (): readonly HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>('[data-slot="zoom-switch"] button'),
]

const offered = (): readonly string[] => buttons().map((one) => one.textContent ?? '')

describe('the zoom switch offers the two rungs the canvas is not at', () => {
  it('draws one control per rung, in the order the record lists them', () => {
    render(<ZoomSwitch onZoom={nowhere} zoom="feature" />)
    for (const rung of ZOOM_ORDER) expect(screen.getByText(ZOOM_WORDS[rung])).toBeTruthy()
  })

  it('marks the rung on screen as current and does not offer it as a button', () => {
    render(<ZoomSwitch onZoom={nowhere} zoom="feature" />)
    expect(screen.getByText(ZOOM_WORDS.feature).getAttribute('aria-current')).toBe('true')
    expect(offered()).toEqual([ZOOM_WORDS.epic, ZOOM_WORDS.item])
  })

  it('moves which one is current when the canvas is at a different rung', () => {
    render(<ZoomSwitch onZoom={nowhere} zoom="epic" />)
    expect(screen.getByText(ZOOM_WORDS.epic).getAttribute('aria-current')).toBe('true')
    expect(offered()).toEqual([ZOOM_WORDS.feature, ZOOM_WORDS.item])
  })

  // Not a form any more: a press used to post a Server Action that set a cookie and re-rendered the
  // whole plan route. The zoom is the screen's own state now (ADR 0069), so a press is a call and no more.
  it('asks for the rung a button names, as a call and never a submit', () => {
    const onZoom = vi.fn<(rung: Rung) => void>()
    render(<ZoomSwitch onZoom={onZoom} zoom="item" />)
    for (const button of buttons()) expect(button.type).toBe('button')
    fireEvent.click(screen.getByText(ZOOM_WORDS.epic))
    fireEvent.click(screen.getByText(ZOOM_WORDS.item))
    expect(onZoom.mock.calls).toEqual([['epic']])
  })

  it('offers widest first, so zooming in reads left to right like the axis under it', () => {
    expect(ZOOM_ORDER).toEqual(['epic', 'feature', 'item'])
  })

  it('names every class as a whole literal, which is the only kind Tailwind emits CSS for', () => {
    render(<ZoomSwitch onZoom={nowhere} zoom="feature" />)
    const current = screen.getByText(ZOOM_WORDS.feature).getAttribute('class') ?? ''
    expect(current).toContain('bg-background')
    expect(buttons()[0]?.getAttribute('class')).toContain('text-muted-foreground')
  })
})
