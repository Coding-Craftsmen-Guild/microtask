import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asClient,
  fakeAdmin,
  problem,
  Redirected,
  redirectOf,
  type FakeAdmin,
} from '../../../../actions/testing/fake-admin'
import { fixtureProject, LIVE_TOKENS, P, T1 } from '../../../../components/projects/testing/project-fixture'

let fake: FakeAdmin

class NotFound extends Error {}

vi.mock('../../../../lib/api', () => ({ apiForSession: () => Promise.resolve(asClient(fake)) }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('notFound')
  },
}))

const { default: ProjectPage, generateMetadata } = await import('./page')

const params = (projectId = P) => ({ params: Promise.resolve({ projectId }) })

const stringsIn = (value: unknown, seen = new WeakSet<object>()): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  const node = isValidElement(value) ? (value.props as object) : value
  return Object.values(node).flatMap((child: unknown) => stringsIn(child, seen))
}

beforeEach(() => {
  fake = fakeAdmin()
  fake.projects.read.mockResolvedValue(fixtureProject())
  fake.shareLinks.list.mockResolvedValue({ shareLinks: fixtureProject().shareLinks })
})

describe('the project page', () => {
  it('puts no share token in the rendered output, for a project holding live links', async () => {
    const { container } = render(await ProjectPage(params()))
    for (const token of LIVE_TOKENS) {
      expect(container.innerHTML).not.toContain(token)
      expect(document.body.innerHTML).not.toContain(token)
    }
  })

  it('hands no component a share token, which is what would land in the Flight payload', async () => {
    const element: ReactNode = await ProjectPage(params())
    const handed = stringsIn(element)
    expect(handed).toContain('Launch')
    for (const token of LIVE_TOKENS) expect(handed.filter((one) => one.includes(token))).toEqual([])
  })

  it('does not list the links to render the page; only the dialog asks for them', async () => {
    render(await ProjectPage(params()))
    expect(fake.projects.read).toHaveBeenCalledWith(P)
    expect(fake.shareLinks.list).not.toHaveBeenCalled()
  })

  it('shows the link count the server counted', async () => {
    render(await ProjectPage(params()))
    expect(screen.getByText('3 share links')).toBeTruthy()
  })

  it('draws the editable title, the way back, and overall progress from the cached counts', async () => {
    render(await ProjectPage(params()))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Project name' }).value).toBe('Launch')
    expect(screen.getByRole('link', { name: '← Projects' }).getAttribute('href')).toBe('/')
    expect(screen.getByText('Overall progress: 43%')).toBeTruthy()
  })

  it('draws the tree with every admin control', async () => {
    render(await ProjectPage(params()))
    expect(screen.getByRole('link', { name: 'Go-live' }).getAttribute('href')).toBe(`/p/${P}/t/${T1}`)
    expect(screen.getByRole('button', { name: '+ Folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
  })

  it('renders not-found for a project that does not exist', async () => {
    fake.projects.read.mockRejectedValue(problem(404, 'Project not found'))
    await expect(ProjectPage(params())).rejects.toBeInstanceOf(NotFound)
  })

  it('renders not-found for an id the API refuses as malformed', async () => {
    fake.projects.read.mockRejectedValue(problem(422, 'must be a ULID'))
    await expect(ProjectPage(params('nope'))).rejects.toBeInstanceOf(NotFound)
  })

  it('sends an expired admin to sign in, back to this project', async () => {
    fake.projects.read.mockRejectedValue(problem(401))
    expect(await redirectOf(ProjectPage(params()))).toBe(`/login?next=%2Fp%2F${P}`)
  })

  it('says why the project could not load', async () => {
    fake.projects.read.mockRejectedValue(problem(500, 'Something broke.'))
    render(await ProjectPage(params()))
    expect(screen.getByRole('alert').textContent).toBe('Something broke.')
  })

  it('names the tab after the project, as legacy did', async () => {
    expect((await generateMetadata(params())).title).toBe('Launch · CC Guild Microtask')
  })
})
