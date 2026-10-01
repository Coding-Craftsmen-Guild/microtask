import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CrumbTrail } from './crumb-trail'

const TRAIL = [
  { label: 'Plans', href: '/' },
  { label: 'Identity Management Plan', href: null },
] as const

describe('CrumbTrail', () => {
  it('names itself, so a bar holding two navigations does not offer two unnamed ones', () => {
    render(<CrumbTrail trail={TRAIL} />)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
  })

  it('links every step that is a place and leaves the one you are on as text', () => {
    render(<CrumbTrail trail={TRAIL} />)
    expect(screen.getByRole('link', { name: 'Plans' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('link', { name: 'Identity Management Plan' })).toBeNull()
    expect(screen.getByText('Identity Management Plan').tagName).toBe('SPAN')
  })

  it('separates the steps with a mark no screen reader has to read out', () => {
    const { container } = render(<CrumbTrail trail={TRAIL} />)
    const marks = [...container.querySelectorAll('[aria-hidden="true"]')]
    expect(marks.map((mark) => mark.textContent)).toEqual(['/'])
  })

  it('opens with no separator, so the first step is not preceded by a slash', () => {
    const { container } = render(<CrumbTrail trail={[{ label: 'Plans', href: '/' }]} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('truncates the step you are on and never the links above it', () => {
    render(<CrumbTrail trail={TRAIL} />)
    expect(screen.getByText('Identity Management Plan').className).toContain('truncate')
    expect(screen.getByRole('link', { name: 'Plans' }).className).toContain('shrink-0')
  })

  it('carries the whole name in a title, since the visible one may be cut', () => {
    render(<CrumbTrail trail={TRAIL} />)
    expect(screen.getByText('Identity Management Plan').getAttribute('title')).toBe(
      'Identity Management Plan',
    )
  })
})
