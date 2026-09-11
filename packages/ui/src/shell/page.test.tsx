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
})
