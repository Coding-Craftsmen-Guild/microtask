import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TableRow } from '../table/rows'
import { FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

const { DrawerPanel } = await import('./drawer-panel')

const FEATURE_ROW: TableRow = {
  id: FEATURE_1,
  kind: 'feature',
  epic: 'Platform',
  feature: 'Auth rewrite',
  item: null,
  estimate: '5d',
  sprint: 'S1',
  treatment: 'solid',
  blockedBy: [],
}

const ITEM_ROW: TableRow = {
  ...FEATURE_ROW,
  id: ITEM_1,
  kind: 'item',
  item: 'Sessions',
  estimate: '3d',
  treatment: 'hollow',
  blockedBy: [],
}

const CLOSE = `/plans/${PLAN_A}`

const labels = (): readonly string[] =>
  [...document.querySelectorAll('dt')].map((node) => node.textContent ?? '')

const valueOf = (label: string): string =>
  [...document.querySelectorAll('dt')]
    .filter((node) => node.textContent === label)
    .map((node) => node.nextElementSibling?.textContent ?? '')
    .join('')

describe('the panel one selection is drawn in', () => {
  it('names the feature as a heading under the plan’s own, not as a second h1', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('is a landmark named for what is open, so a reader can jump to it', () => {
    render(<DrawerPanel closeHref={CLOSE} row={ITEM_ROW} />)
    expect(screen.getByRole('complementary', { name: 'Sessions' })).toBeTruthy()
  })

  it('says which of the two kinds of thing this is, in words and not only in paint', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(screen.getByText('Feature')).toBeTruthy()
    expect(document.querySelector('[data-slot="drawer-panel"]')?.getAttribute('data-kind')).toBe(
      'feature',
    )
  })

  it('carries the treatment as data, because two subjects can render the same words', () => {
    render(<DrawerPanel closeHref={CLOSE} row={ITEM_ROW} />)
    const panel = document.querySelector('[data-slot="drawer-panel"]')
    expect(panel?.getAttribute('data-treatment')).toBe('hollow')
    expect(panel?.getAttribute('data-kind')).toBe('item')
  })

  it('repeats not one word the row already decided, reading each straight off it', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(valueOf('Epic')).toBe('Platform')
    expect(valueOf('Estimate')).toBe('5d')
    expect(valueOf('Sprint')).toBe('S1')
  })

  it('names the feature an item flows under, which a feature’s own panel has no room to repeat', () => {
    render(<DrawerPanel closeHref={CLOSE} row={ITEM_ROW} />)
    expect(labels()).toEqual(['Epic', 'Feature', 'Estimate', 'Sprint'])
    expect(valueOf('Feature')).toBe('Auth rewrite')
  })

  it('leaves the feature row out of that list, the heading having just said it', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(labels()).toEqual(['Epic', 'Estimate', 'Sprint'])
  })

  it('closes by going back to the plan’s own URL, since the selection is the address', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(CLOSE)
  })

  it('draws no control, because this phase decides the answers and the next one spends them', () => {
    render(<DrawerPanel closeHref={CLOSE} row={FEATURE_ROW} />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(document.querySelector('form')).toBeNull()
  })
})
