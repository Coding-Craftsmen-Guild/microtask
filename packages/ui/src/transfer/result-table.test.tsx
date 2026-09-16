import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResultTable } from './result-table'
import type { TransferProjectResult } from './vocabulary'

const result = (over: Partial<TransferProjectResult> = {}): TransferProjectResult => ({
  path: 'volume/projects/01PROJECT',
  projectId: '01PROJECT',
  writtenProjectId: '01PROJECT',
  choice: null,
  outcome: 'created',
  tasksWritten: 3,
  tasksRemoved: 0,
  shareLinksReminted: 0,
  shareLinksStranded: 0,
  reasons: [],
  ...over,
})

const badgeOf = (outcome: string) =>
  document.querySelector(`[data-slot="result-row"][data-outcome="${outcome}"] [data-slot="outcome"]`)
    ?.className ?? ''

describe('ResultTable', () => {
  it('gives every confirmed project a row, whichever of the five things happened to it', () => {
    render(
      <ResultTable
        results={[
          result({ path: 'a', outcome: 'created' }),
          result({ path: 'b', outcome: 'replaced', choice: 'replace' }),
          result({ path: 'c', outcome: 'skipped', choice: 'skip', writtenProjectId: null }),
          result({ path: 'd', outcome: 'blocked', writtenProjectId: null, reasons: ['refused'] }),
          result({ path: 'e', outcome: 'failed', writtenProjectId: null, reasons: ['write failed'] }),
        ]}
      />,
    )
    expect(document.querySelectorAll('[data-slot="result-row"]').length).toBe(5)
  })

  it('paints a skipped project unlike a failed or a blocked one, which ADR 0018 requires', () => {
    render(
      <ResultTable
        results={[
          result({ path: 'c', outcome: 'skipped', choice: 'skip', writtenProjectId: null }),
          result({ path: 'd', outcome: 'blocked', writtenProjectId: null, reasons: ['refused'] }),
          result({ path: 'e', outcome: 'failed', writtenProjectId: null, reasons: ['write failed'] }),
        ]}
      />,
    )
    const skipped = badgeOf('skipped')
    expect(skipped).not.toBe('')
    expect(skipped).not.toBe(badgeOf('failed'))
    expect(skipped).not.toBe(badgeOf('blocked'))
    expect(screen.getByText('Skipped')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('shows where a reminted project actually landed as well as where it was dropped from', () => {
    render(
      <ResultTable
        results={[
          result({ choice: 'new', outcome: 'created', writtenProjectId: '01FRESH', shareLinksReminted: 3 }),
        ]}
      />,
    )
    expect(screen.getByText('written as 01FRESH')).toBeTruthy()
    expect(screen.getByText('Import as new')).toBeTruthy()
  })

  it('reports all four counts §7.4 asks an admin to check afterwards', () => {
    render(
      <ResultTable
        results={[
          result({
            choice: 'replace',
            outcome: 'replaced',
            tasksWritten: 9,
            tasksRemoved: 2,
            shareLinksReminted: 0,
            shareLinksStranded: 4,
          }),
        ]}
      />,
    )
    const row = document.querySelector('[data-slot="result-row"]')
    expect(row?.textContent).toContain('9 written · 2 removed')
    expect(row?.textContent).toContain('0 reminted · 4 stranded')
  })

  it('says a project needed no choice rather than leaving the cell empty', () => {
    render(<ResultTable results={[result()]} />)
    expect(screen.getByText('No choice needed')).toBeTruthy()
  })

  it('lists every reason a project that did not land gave', () => {
    render(
      <ResultTable
        results={[
          result({ outcome: 'failed', writtenProjectId: null, reasons: ['ENOSPC', 'rolled back'] }),
        ]}
      />,
    )
    expect(screen.getByText('ENOSPC')).toBeTruthy()
    expect(screen.getByText('rolled back')).toBeTruthy()
  })
})
