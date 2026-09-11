import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asClient,
  fakeAdmin,
  problem,
  Redirected,
  redirectOf,
  type FakeAdmin,
} from '../../actions/testing/fake-admin'
import { ACTION_REFUSALS } from '../../lib/refusal'

let fake: FakeAdmin
let session: 'present' | 'absent' = 'present'

vi.mock('../../lib/api', () => ({
  apiForSession: () => Promise.resolve(session === 'present' ? asClient(fake) : null),
}))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))

const { default: ProjectsPage, metadata } = await import('./page')

const TOKEN = 'tok_LIVELIVELIVELIVELIVELIVE'
const P = '01HZZZZZZZZZZZZZZZZZZZZZZ1'

const listed = {
  id: P,
  name: 'Launch',
  folders: [],
  tasks: [],
  shareLinkCount: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

beforeEach(() => {
  fake = fakeAdmin()
  session = 'present'
  fake.projects.list.mockResolvedValue({ projects: [listed] })
  fake.projects.read.mockResolvedValue({ ...listed, shareLinks: [{ token: TOKEN }] })
  fake.shareLinks.list.mockResolvedValue({ shareLinks: [{ token: TOKEN }] })
})

describe('the projects index', () => {
  it('renders a row per project from the list', async () => {
    render(await ProjectsPage())
    expect(screen.getByRole('link', { name: 'Launch' }).getAttribute('href')).toBe(`/p/${P}`)
    expect(screen.getByTestId('row-meta').textContent).toContain('0 tasks · 1 share link · updated')
  })

  it('reads the list and nothing that carries a share token', async () => {
    const { container } = render(await ProjectsPage())
    expect(fake.projects.list).toHaveBeenCalledTimes(1)
    expect(fake.projects.read).not.toHaveBeenCalled()
    expect(fake.shareLinks.list).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toContain(TOKEN)
  })

  it('offers the create form above the list', async () => {
    render(await ProjectsPage())
    expect(screen.getByRole('button', { name: 'Create project' })).toBeTruthy()
  })

  it('shows legacy’s empty state when there are no projects', async () => {
    fake.projects.list.mockResolvedValue({ projects: [] })
    render(await ProjectsPage())
    expect(screen.getByText('No projects yet — create your first one above.')).toBeTruthy()
  })

  it('says why the list could not load, and still offers create', async () => {
    fake.projects.list.mockRejectedValue(problem(500, 'Something broke.'))
    render(await ProjectsPage())
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.broken)
    expect(screen.getByRole('button', { name: 'Create project' })).toBeTruthy()
  })

  it('sends an expired admin to sign in', async () => {
    fake.projects.list.mockRejectedValue(problem(401))
    expect(await redirectOf(ProjectsPage())).toBe('/login')
  })

  it('sends a browser with no session to sign in', async () => {
    session = 'absent'
    expect(await redirectOf(ProjectsPage())).toBe('/login')
  })

  it('names the tab the way the app being replaced did', () => {
    expect(metadata.title).toBe('Projects · CC Guild Microtask')
  })
})
