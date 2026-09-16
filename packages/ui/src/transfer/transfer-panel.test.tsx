import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TransferPanel } from './transfer-panel'
import type { HarvestedFile, TransferGroup, TransferPreview, TransferResult } from './vocabulary'

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

const harvested = (path: string): HarvestedFile => ({
  path,
  file: new File(['{}'], path.split('/').pop() ?? 'file.json'),
})

const preview = (groups: readonly TransferGroup[]): TransferPreview => ({
  sessionId: '01SESSION',
  groups,
})

const panel = (over: Partial<Parameters<typeof TransferPanel>[0]> = {}) => {
  const onConfirm = vi.fn()
  render(
    <TransferPanel
      files={[]}
      onConfirm={onConfirm}
      preview={null}
      result={null}
      {...over}
    />,
  )
  return onConfirm
}

const notice = () => document.querySelector('[data-slot="remint-notice"]')

describe('TransferPanel', () => {
  it('lists every harvested path, so a file lost before the preview can still be seen', () => {
    panel({
      files: [harvested('volume/projects/01/project.json'), harvested('volume/projects/01/tasks/02.json')],
    })
    expect(screen.getByText('volume/projects/01/project.json')).toBeTruthy()
    expect(screen.getByText('volume/projects/01/tasks/02.json')).toBeTruthy()
    expect(screen.getByText('2 files harvested')).toBeTruthy()
  })

  it('renders the preview table once a preview arrives, and says so before one has', () => {
    panel()
    expect(document.querySelector('[data-slot="preview-table"]')).toBeNull()
    expect(screen.getByText('Nothing has been previewed yet.')).toBeTruthy()
  })

  it('offers no conflict choice for a project the target store does not already hold', () => {
    panel({ preview: preview([group({ existsInTarget: false })]) })
    expect(document.querySelector('[data-slot="preview-table"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="conflicts"]')).toBeNull()
  })

  it('renders the §7.4 sentence when import as new is chosen on a project that already exists', async () => {
    panel({
      preview: preview([
        group({
          existsInTarget: true,
          shareLinks: [
            { index: 0, name: 'Acme', role: 'view', scope: { kind: 'project', projectId: '01PROJECT' } },
            { index: 1, name: 'Beta', role: 'write', scope: { kind: 'project', projectId: '01PROJECT' } },
            { index: 2, name: 'Cee', role: 'manage', scope: { kind: 'project', projectId: '01PROJECT' } },
          ],
        }),
      ]),
    })
    expect(notice()).toBeNull()
    await userEvent.click(screen.getByLabelText('Import as new'))
    expect(notice()?.textContent).toBe(
      "3 share links will get new URLs; the existing project's links keep working.",
    )
  })

  it('takes the sentence’s count from the group the choice was made on, not from the drop', async () => {
    panel({
      preview: preview([
        group({ path: 'a', projectId: '01A', existsInTarget: true, shareLinks: [] }),
        group({
          path: 'b',
          projectId: '01B',
          name: 'Beta',
          existsInTarget: true,
          shareLinks: [
            { index: 0, name: 'One', role: 'view', scope: { kind: 'project', projectId: '01B' } },
          ],
        }),
      ]),
    })
    await userEvent.click(screen.getAllByLabelText('Import as new')[1] as HTMLElement)
    expect(notice()?.textContent).toBe(
      "1 share link will get a new URL; the existing project's links keep working.",
    )
  })

  it('confirms with one choice per colliding project, defaulting every one of them to skip', async () => {
    const onConfirm = panel({
      preview: preview([
        group({ path: 'a', projectId: '01A', existsInTarget: true }),
        group({ path: 'b', projectId: '01B', existsInTarget: true }),
        group({ path: 'c', projectId: '01C', existsInTarget: false }),
      ]),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(onConfirm.mock.calls).toEqual([
      [
        [
          { projectId: '01A', choice: 'skip' },
          { projectId: '01B', choice: 'skip' },
        ],
      ],
    ])
  })

  it('carries the choice that was actually made into the confirm', async () => {
    const onConfirm = panel({
      preview: preview([group({ path: 'a', projectId: '01A', existsInTarget: true })]),
    })
    await userEvent.click(screen.getByLabelText('Replace'))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(onConfirm.mock.calls).toEqual([[[{ projectId: '01A', choice: 'replace' }]]])
  })

  it('offers no choice for a group the preview refused, which carries no id to address', () => {
    panel({
      preview: preview([
        group({ projectId: null, existsInTarget: true, outcome: 'blocked', reasons: ['two groups claim one id'] }),
      ]),
    })
    expect(document.querySelector('[data-slot="conflicts"]')).toBeNull()
  })

  it('renders what the confirm did once a result arrives, and nothing before', () => {
    const result: TransferResult = {
      sessionId: '01SESSION',
      projects: [
        {
          path: 'a',
          projectId: '01A',
          writtenProjectId: null,
          choice: 'skip',
          outcome: 'skipped',
          tasksWritten: 0,
          tasksRemoved: 0,
          shareLinksReminted: 0,
          shareLinksStranded: 0,
          reasons: [],
        },
      ],
    }
    panel({ preview: preview([group()]), result })
    expect(document.querySelector('[data-slot="result-table"]')).toBeTruthy()
    expect(screen.getByText('Skipped')).toBeTruthy()
  })
})
