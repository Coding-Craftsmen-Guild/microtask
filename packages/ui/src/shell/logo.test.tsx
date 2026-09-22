import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LOGO_PATH, Logo } from './logo'

describe('Logo', () => {
  it('serves the one mark both products carry, from the path legacy used', () => {
    expect(LOGO_PATH).toBe('/img/logo.webp')
  })

  it.each(['bar', 'login'] as const)('draws the %s size at the dimensions legacy drew it', (size) => {
    render(<Logo size={size} />)
    const mark = screen.getByAltText('CC Guild logo')
    expect(mark.getAttribute('src')).toBe(LOGO_PATH)
    expect(mark.getAttribute('width')).toBe(size === 'bar' ? '34' : '74')
    expect(mark.getAttribute('height')).toBe(size === 'bar' ? '34' : '74')
  })

  it('carries alt text, so the mark is not an unnamed image in a screen reader', () => {
    render(<Logo size="bar" />)
    expect(screen.getByAltText('CC Guild logo').tagName).toBe('IMG')
  })
})
