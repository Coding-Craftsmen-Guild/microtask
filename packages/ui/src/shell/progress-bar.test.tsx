import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './progress-bar'

const SOURCE = readFileSync(resolve(process.cwd(), 'src/shell/progress-bar.tsx'), 'utf8')

const fillOf = (container: HTMLElement) => {
  const fill = container.querySelector('[data-slot="progress-bar-fill"]')
  if (!(fill instanceof HTMLElement)) throw new Error('no fill element rendered')
  return fill
}

const trackOf = (container: HTMLElement) => {
  const track = fillOf(container).parentElement
  if (!(track instanceof HTMLElement)) throw new Error('the fill has no track around it')
  return track
}

describe('ProgressBar', () => {
  it('labels an empty checklist "No tasks yet" rather than "0 / 0 - 0%"', () => {
    const { container } = render(<ProgressBar done={0} total={0} />)
    expect(container.textContent).toBe('No tasks yet')
  })

  it('still renders a zero-width bar at total 0, as the admin pages did', () => {
    const { container } = render(<ProgressBar done={0} total={0} />)
    expect(fillOf(container).style.width).toBe('0%')
  })

  it('labels a partial checklist as done / total with the percentage rounded', () => {
    const { container } = render(<ProgressBar done={1} total={3} />)
    expect(container.textContent).toBe('1 / 3 · 33%')
  })

  it('omits the label but keeps the bar when label is false', () => {
    const { container } = render(<ProgressBar done={1} total={4} label={false} />)
    expect(container.textContent).toBe('')
    expect(fillOf(container).style.width).toBe('25%')
  })

  it('carries the gold gradient while work is outstanding', () => {
    const { container } = render(<ProgressBar done={3} total={4} />)
    const classes = fillOf(container).className
    expect(classes).toContain('from-gold')
    expect(classes).toContain('to-gold-deep')
    expect(classes).not.toContain('from-ok-light')
  })

  it('switches to the green gradient only when done equals a non-zero total', () => {
    const { container } = render(<ProgressBar done={4} total={4} />)
    const classes = fillOf(container).className
    expect(classes).toContain('from-ok-light')
    expect(classes).toContain('to-ok')
    expect(classes).not.toContain('from-gold')
  })

  it('does not treat 0 of 0 as complete, so an empty project is not green', () => {
    const { container } = render(<ProgressBar done={0} total={0} />)
    expect(fillOf(container).className).not.toContain('from-ok-light')
  })

  it('animates from width 0 on first paint by naming the shared keyframe utility', () => {
    const { container } = render(<ProgressBar done={2} total={4} />)
    expect(fillOf(container).className).toContain('animate-progress-fill')
  })

  it('animates a finished checklist too, so completion is not the state that loses the animation', () => {
    for (const props of [
      { done: 0, total: 0 },
      { done: 4, total: 4 },
    ]) {
      const { container } = render(<ProgressBar {...props} />)
      expect(fillOf(container).className, `${props.done} of ${props.total}`).toContain(
        'animate-progress-fill',
      )
      cleanup()
    }
  })

  it('is legacy’s 92x7 track, clipping the fill so a gradient cannot escape the rounded ends', () => {
    const { container } = render(<ProgressBar done={1} total={4} />)
    const track = trackOf(container).className
    expect(track).toContain('w-[92px]')
    expect(track).toContain('h-[7px]')
    expect(track).toContain('overflow-hidden')
    expect(track).toContain('bg-border')
  })

  it('sets the label at legacy’s 12.5px and never lets it wrap mid-row', () => {
    const { container } = render(<ProgressBar done={1} total={4} />)
    const row = container.firstElementChild?.className ?? ''
    expect(row).toContain('text-[12.5px]')
    expect(row).toContain('whitespace-nowrap')
  })

  it('rounds the percentage rather than truncating it, which legacy’s Math.round did', () => {
    const { container } = render(<ProgressBar done={2} total={3} />)
    expect(container.textContent).toBe('2 / 3 · 67%')
    cleanup()
    const nearly = render(<ProgressBar done={199} total={200} />)
    expect(nearly.container.textContent).toBe('199 / 200 · 100%')
    expect(fillOf(nearly.container).className).toContain('from-gold')
  })

  it('takes its width from an inline style, because Tailwind cannot emit a computed class', () => {
    const { container } = render(<ProgressBar done={2} total={4} />)
    expect(fillOf(container).getAttribute('style')).toContain('width: 50%')
    expect(SOURCE).not.toMatch(/w-\[\$\{/)
  })

  it('emits only class names present verbatim in its own source, all the Tailwind scanner reads', () => {
    for (const props of [
      { done: 0, total: 0 },
      { done: 1, total: 4 },
      { done: 4, total: 4 },
    ]) {
      const { container } = render(<ProgressBar {...props} />)
      const nodes = container.querySelectorAll<HTMLElement>('[class]')
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        for (const token of node.className.split(/\s+/).filter(Boolean)) {
          expect(SOURCE, `class "${token}" is not a complete literal in the source`).toContain(token)
        }
      }
      cleanup()
    }
  })
})
