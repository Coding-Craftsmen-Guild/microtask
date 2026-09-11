import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectList } from './project-list'

const NOW = Date.parse('2026-09-11T12:00:00.000Z')
const HOURS_AGO = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString()
const P = '01HZZZZZZZZZZZZZZZZZZZZZZ1'

const task = (name: string, position: number, [done, total] = [0, 0]) => ({
  id: `01HZZZZZZZZZZZZZZZZZZZZ${String(position).padStart(3, '0')}`,
  name,
  position,
  folderId: null,
  progress: { done, total },
  updatedAt: HOURS_AGO(1),
  tabCount: 1,
  tabNames: ['General'],
})

const project = (overrides: Record<string, unknown> = {}) => ({
  id: P,
  name: 'Launch',
  folders: [],
  tasks: [task('Go-live', 0, [1, 4]), task('DNS cutover', 1, [2, 2]), task('Kickoff', 2)],
  shareLinkCount: 2,
  createdAt: HOURS_AGO(100),
  updatedAt: HOURS_AGO(2),
  ...overrides,
})

const renderList = (projects: readonly ReturnType<typeof project>[]) =>
  render(<ProjectList now={NOW} onDelete={vi.fn()} projects={projects} />)

describe('ProjectList', () => {
  it('says so, verbatim, when there are no projects', () => {
    renderList([])
    expect(screen.getByText('No projects yet — create your first one above.')).toBeTruthy()
  })

  it('reads the metadata line in legacy shape, one level up: tasks, share links, updated', () => {
    renderList([project()])
    expect(screen.getByTestId('row-meta').textContent).toBe('3 tasks · 2 share links · updated 2h ago')
  })

  it('omits the share-links clause at zero', () => {
    renderList([project({ shareLinkCount: 0 })])
    expect(screen.getByTestId('row-meta').textContent).toBe('3 tasks · updated 2h ago')
  })

  it('omits it when the count was withheld', () => {
    renderList([project({ shareLinkCount: undefined })])
    expect(screen.getByTestId('row-meta').textContent).toBe('3 tasks · updated 2h ago')
  })

  it('opens the project from its name and from Open', () => {
    renderList([project()])
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([`/p/${P}`, `/p/${P}`])
    expect(links.map((link) => link.textContent)).toEqual(['Launch', 'Open'])
  })

  it('draws the project bar from the sum of its tasks’ cached progress', () => {
    renderList([project()])
    expect(screen.getByText('3 / 6 · 50%')).toBeTruthy()
  })

  it('draws "No tasks yet" for a project with no checklist items', () => {
    renderList([project({ tasks: [] })])
    expect(screen.getByText('No tasks yet')).toBeTruthy()
  })

  it('shows the first eight task names as chips in tree order, and says how many more', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    renderList([project({ tasks: names.map((name, index) => task(name, 9 - index)) })])
    const chips = within(screen.getByRole('list', { name: 'Tasks' })).getAllByRole('listitem')
    expect(chips.map((chip) => chip.textContent)).toEqual(['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', '+2 more'])
  })

  it('renders one row per project, in the order the API sent', () => {
    renderList([project({ name: 'Newer' }), project({ id: '01HZZZZZZZZZZZZZZZZZZZZZZ2', name: 'Older' })])
    expect(screen.getAllByTestId('project-name').map((name) => name.textContent)).toEqual(['Newer', 'Older'])
  })
})
