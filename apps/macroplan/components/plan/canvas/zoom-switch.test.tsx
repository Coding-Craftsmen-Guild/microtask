import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ZoomSwitch } from './zoom-switch'
import { ZOOM_ORDER, ZOOM_WORDS } from './zoom-view'

afterEach(cleanup)

const buttons = (): readonly HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>('button[name="rung"]'),
]

describe('the zoom switch offers the two rungs the canvas is not at', () => {
  it('draws one control per rung, in the order the record lists them', () => {
    render(<ZoomSwitch zoom="feature" />)
    for (const rung of ZOOM_ORDER) expect(screen.getByText(ZOOM_WORDS[rung])).toBeTruthy()
  })

  it('marks the rung on screen as current and does not offer it as a button', () => {
    render(<ZoomSwitch zoom="feature" />)
    expect(screen.getByText(ZOOM_WORDS.feature).getAttribute('aria-current')).toBe('true')
    expect(buttons().map((one) => one.value)).toEqual(['epic', 'item'])
  })

  it('moves which one is current when the canvas is at a different rung', () => {
    render(<ZoomSwitch zoom="epic" />)
    expect(screen.getByText(ZOOM_WORDS.epic).getAttribute('aria-current')).toBe('true')
    expect(buttons().map((one) => one.value)).toEqual(['feature', 'item'])
  })

  it('submits each rung by name, which is the field chooseZoom reads', () => {
    render(<ZoomSwitch zoom="item" />)
    for (const button of buttons()) {
      expect(button.name).toBe('rung')
      expect(button.type).toBe('submit')
    }
    expect(buttons().map((one) => one.value)).toEqual(['epic', 'feature'])
  })

  it('offers widest first, so zooming in reads left to right like the axis under it', () => {
    expect(ZOOM_ORDER).toEqual(['epic', 'feature', 'item'])
  })

  it('names every class as a whole literal, which is the only kind Tailwind emits CSS for', () => {
    render(<ZoomSwitch zoom="feature" />)
    const current = screen.getByText(ZOOM_WORDS.feature).getAttribute('class') ?? ''
    expect(current).toContain('bg-card')
    expect(buttons()[0]?.getAttribute('class')).toContain('text-muted-foreground')
  })
})
