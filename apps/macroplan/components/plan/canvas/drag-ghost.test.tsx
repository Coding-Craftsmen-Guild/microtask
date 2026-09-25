import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DragGhost } from './drag-ghost'
import type { Held } from './selection'
import { LAYOUT } from './view'

const HELD: Held = {
  grabbed: { featureId: 'feature-1', epicId: 'epic-1', x: 300, y: 62, width: 70 },
  rails: [],
  railTop: 46,
  box: { viewBox: '0 0 1000 220', width: 1000, height: 220 },
  travelled: { x: 28, y: -12 },
}

const only = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const numberAt = (element: Element, name: string): number => Number(element.getAttribute(name))

const ghostOf = (refused: boolean) => {
  cleanup()
  render(<DragGhost held={HELD} refused={refused} />)
  return { svg: only('[data-slot="drag-ghost"]'), rect: only('[data-slot="drag-ghost"] rect') }
}

afterEach(cleanup)

describe('the moving rect a drag draws', () => {
  it('takes the canvas’s own box, so one user unit is the same distance in both', () => {
    const { svg } = ghostOf(false)
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 220')
    expect(numberAt(svg, 'width')).toBe(1000)
    expect(numberAt(svg, 'height')).toBe(220)
  })

  it('draws the dragged bar’s own top left plus the travel, and never a measured position', () => {
    const { rect } = ghostOf(false)
    expect(numberAt(rect, 'x')).toBe(328)
    expect(numberAt(rect, 'y')).toBe(50)
  })

  it('keeps the dragged bar’s width and every bar’s height, a drag moving and never resizing', () => {
    const { rect } = ghostOf(false)
    expect(numberAt(rect, 'width')).toBe(70)
    expect(numberAt(rect, 'height')).toBe(LAYOUT.barHeight)
  })

  it('takes no pointer, which is the sheet phase 2 refused and would swallow its own pointerup', () => {
    const { svg } = ghostOf(false)
    expect(svg.getAttribute('class')).toContain('pointer-events-none')
    expect(svg.getAttribute('class')).toContain('absolute')
  })

  it('paints the refusal in the colour this canvas already spends on a contradiction', () => {
    expect(ghostOf(true).rect.getAttribute('class')).toContain('stroke-destructive')
    expect(ghostOf(false).rect.getAttribute('class')).not.toContain('stroke-destructive')
  })

  it('states the refusal as an attribute too, the paint being the one thing no test can see', () => {
    expect(ghostOf(true).rect.getAttribute('data-refused')).toBe('true')
    expect(ghostOf(false).rect.getAttribute('data-refused')).toBe('false')
  })

  it('is out of the accessibility tree and out of the tab order, being a pointer’s own feedback', () => {
    const { svg } = ghostOf(false)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect(screen.queryAllByRole('img')).toEqual([])
  })
})
