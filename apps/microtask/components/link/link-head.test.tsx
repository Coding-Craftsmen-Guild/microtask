import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccessBadge } from './access-badge'
import { LinkHead } from './link-head'
import { LinkProgress } from './link-progress'

describe('AccessBadge', () => {
  it('reads You can edit on a gold tint for a writable editor', () => {
    render(<AccessBadge writable />)
    const badge = screen.getByText('You can edit')
    expect(badge.className).toContain('bg-gold/25')
  })

  it('reads View only on an indigo tint for a read-only one', () => {
    render(<AccessBadge writable={false} />)
    const badge = screen.getByText('View only')
    expect(badge.className).toContain('bg-brand-soft')
  })
})

describe('LinkProgress', () => {
  it('says Overall progress with a bar when there are checklist items', () => {
    const { container } = render(<LinkProgress done={1} total={3} />)
    expect(screen.getByText('Overall progress: 33%')).toBeTruthy()
    expect(container.querySelector('[data-slot="progress-bar-fill"]')).not.toBeNull()
  })

  it('says Overall progress: 0% while items exist and none is ticked, not the empty-project sentence', () => {
    render(<LinkProgress done={0} total={2} />)
    expect(screen.getByText('Overall progress: 0%')).toBeTruthy()
    expect(screen.queryByText('A shared project workspace')).toBeNull()
  })

  it('says A shared project workspace, and draws no bar, when there are none', () => {
    const { container } = render(<LinkProgress done={0} total={0} />)
    expect(screen.getByText('A shared project workspace')).toBeTruthy()
    expect(container.querySelector('[data-slot="progress-bar-fill"]')).toBeNull()
  })
})

describe('LinkHead', () => {
  it('heads the page with its title, beside whatever Share it was handed', () => {
    render(<LinkHead progress={{ done: 0, total: 0 }} share={<button type="button">Share</button>} title="Go-live" writable />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Go-live')
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(screen.getByText('You can edit')).toBeTruthy()
  })

  it('says nothing about who the link is for, since the bootstrap answer carries no link name', () => {
    const { container } = render(<LinkHead progress={{ done: 0, total: 0 }} share={null} title="Go-live" writable={false} />)
    expect(container.textContent).not.toContain('Signed in as')
  })
})
