import { render } from '@testing-library/react'
import { LOGO_PATH } from '@repo/ui/shell/logo'
import { describe, expect, it } from 'vitest'
import RootLayout, { metadata } from './layout'

describe('the document shell', () => {
  it('declares the CC Guild mark as every page icon', () => {
    expect(metadata.icons).toEqual({ icon: LOGO_PATH })
  })

  it('names no title of its own, so each page sets one', () => {
    expect('title' in metadata).toBe(false)
  })

  it('renders its children', () => {
    const { container } = render(<RootLayout>body text</RootLayout>)
    expect(container.textContent).toContain('body text')
  })
})
