import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BackLink } from './back-link'

describe('BackLink', () => {
  it('links to the page one level up, saying what it was given', () => {
    render(<BackLink href="/p/01ABC">← Back to project</BackLink>)
    expect(screen.getByRole('link', { name: '← Back to project' }).getAttribute('href')).toBe('/p/01ABC')
  })
})
