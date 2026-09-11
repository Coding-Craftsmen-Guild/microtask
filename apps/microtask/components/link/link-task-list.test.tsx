import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}))

const { LinkTaskList } = await import('./link-task-list')

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const FOLDERS = [
  { id: 'f2', name: 'Beta Co', position: 1 },
  { id: 'f1', name: 'ACME', position: 0 },
  { id: 'f3', name: 'Empty', position: 2 },
]
const task = (id: string, name: string, folderId: string | null, position: number) => ({
  id,
  name,
  folderId,
  position,
  progress: { done: 1, total: 2 },
  tabCount: 10,
  tabNames: ['General', 'DNS'],
})
const TASKS = [task('t3', 'Kickoff', null, 0), task('t2', 'Invoices', 'f2', 0), task('t1b', 'DNS', 'f1', 1), task('t1a', 'Go-live', 'f1', 0)]

const hrefs = (container: HTMLElement) => [...container.querySelectorAll('li a')].map((one) => [one.textContent, one.getAttribute('href')])

describe('LinkTaskList', () => {
  it('groups tasks under their folders in order, the root last, each linking under this token', () => {
    const { container } = render(<LinkTaskList folders={FOLDERS} showFolders tasks={TASKS} token={TOKEN} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((one) => one.textContent)).toEqual(['ACME', 'Beta Co'])
    expect(hrefs(container)).toEqual([
      ['Go-live', `/s/${TOKEN}/t/t1a`],
      ['DNS', `/s/${TOKEN}/t/t1b`],
      ['Invoices', `/s/${TOKEN}/t/t2`],
      ['Kickoff', `/s/${TOKEN}/t/t3`],
    ])
  })

  it('draws no folder name where the folder list is not reachable', () => {
    render(<LinkTaskList folders={FOLDERS} showFolders={false} tasks={TASKS} token={TOKEN} />)
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([])
    expect(screen.queryByText('ACME')).toBeNull()
  })

  it('draws each task’s tabs and bar, saying how many tabs there are beyond the ones named', () => {
    const { container } = render(<LinkTaskList folders={FOLDERS} showFolders tasks={[task('t1a', 'Go-live', 'f1', 0)]} token={TOKEN} />)
    expect(screen.getByRole('list', { name: 'Tabs' }).textContent).toContain('+8 more')
    expect(container.querySelector('[data-slot="progress-bar-fill"]')).not.toBeNull()
  })

  it('says so when the project has no tasks yet', () => {
    render(<LinkTaskList folders={[]} showFolders tasks={[]} token={TOKEN} />)
    expect(screen.getByText('No tasks have been added here yet.')).toBeTruthy()
  })
})
