import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders its message verbatim, so callers own the exact legacy wording', () => {
    const { container } = render(
      <EmptyState>No projects yet — create your first one above.</EmptyState>,
    )
    expect(container.textContent).toBe('No projects yet — create your first one above.')
  })

  it('is a centred muted card', () => {
    const { container } = render(<EmptyState>Nothing here</EmptyState>)
    const card = container.firstElementChild
    expect(card?.className).toContain('text-center')
    expect(card?.className).toContain('text-muted-foreground')
    expect(card?.className).toContain('rounded-xl')
  })
})
