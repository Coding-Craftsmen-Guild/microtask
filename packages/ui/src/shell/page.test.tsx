import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COLUMN, Page } from './page'

describe('Page', () => {
  it('renders its children inside the one width-and-padding container', () => {
    render(
      <Page>
        <h1>Projects</h1>
      </Page>,
    )
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
  })

  it('is the main landmark, centred at legacy 900px with the mobile padding step', () => {
    const { container } = render(<Page>body</Page>)
    const main = container.querySelector('main')
    expect(main).toBeTruthy()
    expect(main?.className).toContain('max-w-[900px]')
    expect(main?.className).toContain('mx-auto')
    expect(main?.className).toContain('px-5')
    expect(main?.className).toContain('max-sm:px-3.5')
  })

  it('defaults to byte-identical markup with no width given', () => {
    const { container } = render(<Page>body</Page>)
    const main = container.querySelector('main')
    expect(main?.className).toBe('mx-auto w-full max-w-[900px] px-5 pb-20 max-sm:px-3.5')
  })

  it('drops the max-width cap for width="wide" while keeping the rest', () => {
    const { container } = render(<Page width="wide">body</Page>)
    const main = container.querySelector('main')
    expect(main).toBeTruthy()
    expect(main?.className).not.toContain('max-w-[900px]')
    expect(main?.className).toBe('mx-auto w-full px-5 pb-20 max-sm:px-3.5')
  })

  it('caps the column with the same tokens the exported COLUMN carries, so neither can move alone', () => {
    const { container } = render(<Page>body</Page>)
    const classes = (container.querySelector('main')?.className ?? '').split(' ')
    for (const token of COLUMN.split(' ')) expect(classes, token).toContain(token)
    expect(COLUMN).toContain('max-w-[900px]')
  })

  it('leaves the exported COLUMN out of the wide width, which is the whole point of it', () => {
    const { container } = render(<Page width="wide">body</Page>)
    expect(container.querySelector('main')?.className).not.toContain('max-w-[900px]')
  })

  it('renders the main landmark for width="wide" too', () => {
    render(
      <Page width="wide">
        <h1>Timeline</h1>
      </Page>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeTruthy()
  })
it('drops the padding as well for width="full", which is what an application frame needs', () => {
    const { container } = render(<Page width="full">body</Page>)
    const classes = container.querySelector('main')?.className ?? ''
    expect(classes).not.toContain('pb-20')
    expect(classes).not.toContain('px-5')
    expect(classes).not.toContain('max-w-[900px]')
  })

  // Without flex-1 the frame collapses to its content and the viewport is blank beneath it, which is
  // what the plan page looked like before this was here. Its layout supplies the flex column.
  it('grows to fill a flex column for width="full", the frame sizing itself to the viewport', () => {
    const { container } = render(<Page width="full">body</Page>)
    const classes = container.querySelector('main')?.className ?? ''
    expect(classes).toContain('flex-1')
    expect(classes).toContain('min-h-0')
  })

  it('renders the main landmark for width="full" too, so the page keeps one', () => {
    render(
      <Page width="full">
        <h1>Board</h1>
      </Page>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
  })
})
