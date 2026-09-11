import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoleValue, ScopeValue } from '@repo/contracts'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Redirected, redirectOf } from '../../../../../actions/testing/fake-admin'
import { LINK_UNAVAILABLE_PATH } from '../../../../../lib/routes'
import type { TaskWorkspaceProps } from '../../../../../components/tabs/task-workspace'
import { fakeLinkApiState, fakeLinkFetch, P, T1, TAB_A, TAB_B, type FakeLinkApiState } from '../../../../../components/link/testing/fake-link-api'

const consulted: string[] = []
const seen: TaskWorkspaceProps[] = []

class NotFound extends Error {}

vi.mock('next/headers', () => ({
  cookies: () => {
    consulted.push('cookies')
    return Promise.resolve({ get: () => undefined, set: () => undefined })
  },
  headers: () => {
    consulted.push('headers')
    return Promise.resolve(new Headers())
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('notFound')
  },
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}))
vi.mock('../../../../../components/tabs/task-workspace', () => ({
  TaskWorkspace: (props: TaskWorkspaceProps) => {
    seen.push(props)
    return <div data-testid="workspace" />
  },
}))

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const TASK_SCOPE: ScopeValue = { kind: 'task', projectId: P, taskId: T1 }
const PROJECT_SCOPE: ScopeValue = { kind: 'project', projectId: P }

let api: FakeLinkApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakeLinkApiState()
  vi.stubGlobal('fetch', fakeLinkFetch(api))
  seen.length = 0
  consulted.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { default: LinkTaskPage, generateMetadata } = await import('./page')

const holding = (role: RoleValue, scope: ScopeValue): void => {
  api.shares.set(TOKEN, { role, scope })
}

const props = (taskId: string = T1, query: Record<string, string | string[] | undefined> = {}) => ({
  params: Promise.resolve({ token: TOKEN, taskId }),
  searchParams: Promise.resolve(query),
})

const outcomeOf = (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    (value) => value,
    (error: unknown) => error,
  )

describe('/s/<token>/t/<taskId> on a project-scoped link', () => {
  it('reads the task under the link’s own project, with the URL token', async () => {
    holding('write', PROJECT_SCOPE)
    render(await LinkTaskPage(props()))
    expect(api.received.map((one) => `${one.path} ${String(one.bearer)}`)).toEqual([
      `/v1/microtask/shares/current ${TOKEN}`,
      `/v1/microtask/projects/${P}/tasks/${T1} ${TOKEN}`,
    ])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Go-live')
    expect(seen[0]).toMatchObject({ audience: 'link', documentRoot: `/s/${TOKEN}/api/projects/${P}/tasks/${T1}/tabs` })
  })

  it('links back to the link’s own list, never to /login or to the admin surface', async () => {
    holding('view', PROJECT_SCOPE)
    const { container } = render(await LinkTaskPage(props()))
    expect(screen.getByRole('link', { name: '← Back to tasks' }).getAttribute('href')).toBe(`/s/${TOKEN}`)
    expect(container.querySelector('a[href^="/login"], a[href^="/p/"]')).toBeNull()
  })

  it('validates ?tab= against this task’s tabs, falling back to the first', async () => {
    holding('view', PROJECT_SCOPE)
    render(await LinkTaskPage(props(T1, { tab: TAB_B })))
    render(await LinkTaskPage(props(T1, { tab: 'somebody-elses-tab' })))
    expect(seen.map((one) => one.initialTabId)).toEqual([TAB_B, TAB_A])
  })

  it('renders not-found for a task the project does not hold', async () => {
    holding('view', PROJECT_SCOPE)
    expect(await outcomeOf(LinkTaskPage(props('01M240FB4GD6PF6V0PKZVF6FZZ')))).toBeInstanceOf(NotFound)
  })

  it('counts only the links scoped to this task beside a manage link’s Share, as the admin task page does', async () => {
    holding('manage', PROJECT_SCOPE)
    const seat = (token: string, scope: ScopeValue) => ({ token, name: 'x', role: 'view', scope, createdBy: null, createdAt: 'S0' })
    api.shareLinks = [
      seat('tok_THISTASKTHISTASKTHIS1', { kind: 'task', projectId: P, taskId: T1 }),
      seat('tok_OTHERTASKOTHERTASK01', { kind: 'task', projectId: P, taskId: '01M240FB4GD6PF6V0PKZVF6FD8' }),
      seat('tok_WHOLEPROJECTWHOLEPR1', PROJECT_SCOPE),
    ]
    const { container } = render(await LinkTaskPage(props()))
    expect(screen.getByText('1 share link')).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/tok_(THISTASK|OTHERTASK|WHOLEPROJECT)/)
  })

  it('draws no Share for a view link, whose capabilities clear neither listing nor minting', async () => {
    holding('view', PROJECT_SCOPE)
    render(await LinkTaskPage(props()))
    expect(screen.getByTestId('workspace')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('offers a manage link only this task to mint over, as the admin task page does', async () => {
    holding('manage', PROJECT_SCOPE)
    render(await LinkTaskPage(props()))
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    const opens = within(screen.getByRole('dialog')).getByRole<HTMLSelectElement>('combobox', { name: 'Opens' })
    expect([...opens.options].map((one) => one.textContent)).toEqual(['Go-live'])
  })

  it('reads no cookie', async () => {
    holding('manage', PROJECT_SCOPE)
    render(await LinkTaskPage(props()))
    expect(consulted).toEqual([])
  })
})

describe('/s/<token>/t/<taskId> on a task-scoped link', () => {
  it('is a 404 before any task is read — not a redirect to its own task', async () => {
    holding('manage', TASK_SCOPE)
    expect(await outcomeOf(LinkTaskPage(props()))).toBeInstanceOf(NotFound)
    expect(api.received.map((one) => one.path)).toEqual(['/v1/microtask/shares/current'])
  })
})

describe('a dead link on the task route', () => {
  it('goes to the terminal page, never to /login', async () => {
    expect(await redirectOf(LinkTaskPage(props()))).toBe(LINK_UNAVAILABLE_PATH)
  })
})

describe('generateMetadata', () => {
  it('titles the page with the task’s name', async () => {
    holding('view', PROJECT_SCOPE)
    expect(await generateMetadata(props())).toEqual({ title: 'Go-live · CC Guild Microtask' })
  })

  it('names no task for a task-scoped link, whose route does not exist', async () => {
    holding('view', TASK_SCOPE)
    expect(await generateMetadata(props())).toEqual({ title: 'Task · CC Guild Microtask' })
    expect(api.received.map((one) => one.path)).toEqual(['/v1/microtask/shares/current'])
  })
})
