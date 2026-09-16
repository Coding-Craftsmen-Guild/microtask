import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewTable } from './preview-table'
import type { TransferGroup } from './vocabulary'

const group = (over: Partial<TransferGroup> = {}): TransferGroup => ({
  path: 'volume/projects/01PROJECT',
  shape: 'v2-project-directory',
  projectId: '01PROJECT',
  name: 'Acme rollout',
  manifestTaskCount: 2,
  taskFilesFound: 2,
  shareLinks: [],
  existsInTarget: false,
  outcome: 'importable',
  reasons: [],
  ...over,
})

const rowsByOutcome = (outcome: string) =>
  [...document.querySelectorAll(`[data-slot="preview-row"][data-outcome="${outcome}"]`)]

const badgeOf = (row: Element | undefined) =>
  row?.querySelector('[data-slot="outcome"]')?.className ?? ''

describe('PreviewTable', () => {
  it('gives every dropped group a row, including the ones that will not import', () => {
    render(
      <PreviewTable
        groups={[
          group({ path: 'a' }),
          group({ path: 'b', outcome: 'blocked', reasons: ['tasks in manifest: 9, task files found: 7'] }),
          group({ path: 'c', outcome: 'error', shape: 'unrecognised', reasons: ['no project.json beside tasks/'] }),
        ]}
      />,
    )
    expect(document.querySelectorAll('[data-slot="preview-row"]').length).toBe(3)
  })

  it('paints blocked and error differently, because ADR 0018 is about the two reading alike', () => {
    render(
      <PreviewTable
        groups={[
          group({ path: 'b', outcome: 'blocked', reasons: ['refused'] }),
          group({ path: 'c', outcome: 'error', reasons: ['unreadable'] }),
        ]}
      />,
    )
    const blocked = badgeOf(rowsByOutcome('blocked')[0])
    const broken = badgeOf(rowsByOutcome('error')[0])
    expect(blocked).not.toBe('')
    expect(blocked).not.toBe(broken)
    expect(screen.getByText('Blocked')).toBeTruthy()
    expect(screen.getByText('Error')).toBeTruthy()
  })

  it('reads a missing manifest differently from a manifest naming zero tasks', () => {
    render(
      <PreviewTable
        groups={[
          group({ path: 'a', manifestTaskCount: null, taskFilesFound: 3 }),
          group({ path: 'b', manifestTaskCount: 0, taskFilesFound: 0 }),
        ]}
      />,
    )
    expect(screen.getByText('No manifest · 3 task files found')).toBeTruthy()
    expect(screen.getByText('0 in manifest · 0 found')).toBeTruthy()
  })

  it('lists every reason a group carries, because §7.3 wants every problem at once', () => {
    render(
      <PreviewTable
        groups={[group({ outcome: 'blocked', reasons: ['bad id 01!', 'token already on disk'] })]}
      />,
    )
    expect(screen.getByText('bad id 01!')).toBeTruthy()
    expect(screen.getByText('token already on disk')).toBeTruthy()
  })

  it('renders each group’s share links inside its own row, with role and scope', () => {
    render(
      <PreviewTable
        groups={[
          group({
            shareLinks: [
              { index: 0, name: 'Acme', role: 'manage', scope: { kind: 'project', projectId: '01PROJECT' } },
            ],
          }),
        ]}
      />,
    )
    const row = document.querySelector('[data-slot="preview-row"]')
    expect(row?.querySelector('[data-slot="share-link-role"]')?.textContent).toBe('manage')
    expect(row?.querySelector('[data-slot="share-link-scope"]')?.textContent).toBe('project 01PROJECT')
  })

  it('names a group that has no project name rather than leaving the cell blank', () => {
    render(<PreviewTable groups={[group({ name: '', outcome: 'error', reasons: ['unreadable'] })]} />)
    expect(screen.getByText('Unnamed project')).toBeTruthy()
  })
})
