import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OptionsMenu } from './options-menu'

afterEach(() => {
  vi.restoreAllMocks()
})

const duplicateKeyWarnings = (spy: ReturnType<typeof vi.spyOn>): unknown[][] =>
  spy.mock.calls.filter((call) => call.some((part) => String(part).includes('same key')))

describe('OptionsMenu', () => {
  it('keys its items by id, so two items that read the same are still two items to React', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const chosen: string[] = []
    render(
      <OptionsMenu
        items={[
          { id: 'first', label: 'Move to ACME', onSelect: () => chosen.push('first') },
          { id: 'second', label: 'Move to ACME', onSelect: () => chosen.push('second') },
        ]}
        label="Task options"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Task options' }))
    const items = screen.getAllByRole('menuitem', { name: 'Move to ACME' })
    expect(items).toHaveLength(2)
    await user.click(items[1] as HTMLElement)
    expect(chosen).toEqual(['second'])
    expect(duplicateKeyWarnings(errors)).toEqual([])
  })

  it('draws nothing when it has no items', () => {
    const view = render(<OptionsMenu items={[]} label="Task options" />)
    expect(view.container.innerHTML).toBe('')
  })
})
