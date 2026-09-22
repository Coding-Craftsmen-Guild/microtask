import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MacroplanPage, { metadata } from './page'

describe('the admin landing page', () => {
  it('names this product in the tab title', () => {
    expect(metadata.title).toBe('Macroplan · CC Guild')
  })

  it('says there is nothing here yet, rather than rendering an empty list', () => {
    render(<MacroplanPage />)
    expect(screen.getByText(/Macroplan has no plans of its own/)).toBeTruthy()
  })

  it('is a synchronous component, because it reads nothing from the API', () => {
    expect(MacroplanPage.constructor.name).toBe('Function')
  })
})
