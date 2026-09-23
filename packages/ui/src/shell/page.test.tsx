import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Page } from './page'

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

  it('renders the main landmark for width="wide" too', () => {
    render(
      <Page width="wide">
        <h1>Timeline</h1>
      </Page>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeTruthy()
  })
})
