import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { capabilities, type RoleValue, type ScopeValue } from '@repo/contracts'
import { isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Redirected, redirectOf } from '../../../actions/testing/fake-admin'
import { seal } from '../../../lib/crypto'
import { payloadOf } from '../../../lib/principal'
import { SERVICE_UNAVAILABLE } from '../../../lib/problem'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'
import type { TaskWorkspaceProps } from '../../../components/tabs/task-workspace'
import { fakeLinkApiState, fakeLinkFetch, P, problemAnswer, T1, T2, TAB_A, TAB_B, type FakeLinkApiState } from '../../../components/link/testing/fake-link-api'

const consulted: string[] = []
const seen: TaskWorkspaceProps[] = []

vi.mock('next/headers', () => ({
  cookies: () => {
    consulted.push('cookies')
    return Promise.resolve({ get: () => ({ name: 'mt_admin', value: seal('a-cookie-secret-of-at-least-32-by', payloadOf({ kind: 'admin', token: 'admin.1.sig' })) }), set: () => undefined })
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
    throw new Error('notFound')
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
vi.mock('../../../components/tabs/task-workspace', () => ({
  TaskWorkspace: (props: TaskWorkspaceProps) => {
    seen.push(props)
    return <div data-testid="workspace" />
  },
}))

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const OTHER = 'tok_SOMEBODYELSE_000001'
const TASK_SCOPE: ScopeValue = { kind: 'task', projectId: P, taskId: T1 }
const PROJECT_SCOPE: ScopeValue = { kind: 'project', projectId: P }

let api: FakeLinkApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakeLinkApiState()
  api.shareLinks = [{ token: OTHER, name: 'Bob', role: 'view', scope: TASK_SCOPE, createdBy: null, createdAt: 'S0' }]
  vi.stubGlobal('fetch', fakeLinkFetch(api))
  seen.length = 0
  consulted.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { default: LinkPage, generateMetadata } = await import('./page')

const holding = (role: RoleValue, scope: ScopeValue, token = TOKEN): void => {
  api.shares.set(token, { role, scope })
}

const props = (token = TOKEN, query: Record<string, string | string[] | undefined> = {}) => ({
  params: Promise.resolve({ token }),
  searchParams: Promise.resolve(query),
})

const show = async (token = TOKEN, query: Record<string, string | string[] | undefined> = {}) =>
  render(await LinkPage(props(token, query)))

const stringsIn = (value: unknown, visited = new WeakSet<object>()): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function' || typeof value !== 'object' || value === null || visited.has(value)) return []
  visited.add(value)
  const node = isValidElement(value) ? (value.props as object) : value
  return Object.values(node).flatMap((child: unknown) => stringsIn(child, visited))
}

describe('a task-scoped link lands on its task', () => {
  it('asks what the token reaches, then reads that task, both under the URL token', async () => {
    holding('write', TASK_SCOPE)
    await show()
    expect(api.received.map((one) => `${one.method} ${one.path} ${String(one.bearer)}`)).toEqual([
      `GET /v1/microtask/shares/current ${TOKEN}`,
      `GET /v1/microtask/projects/${P}/tasks/${T1} ${TOKEN}`,
    ])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Go-live')
    expect(screen.getByTestId('workspace')).toBeTruthy()
  })

  it('hands the workspace the task’s tabs in order, for the link audience, writing under /s/<token>', async () => {
    holding('write', TASK_SCOPE)
    await show()
    expect(seen[0]?.tabs.map((one) => one.id)).toEqual([TAB_A, TAB_B])
    expect(seen[0]).toMatchObject({
      audience: 'link',
      documentRoot: `/s/${TOKEN}/api/projects/${P}/tasks/${T1}/tabs`,
      task: { projectId: P, taskId: T1 },
      initialTabId: TAB_A,
    })
  })

  it.each(['view', 'write', 'manage'] as const)('draws a %s link’s controls from capabilities(role, scope)', async (role) => {
    holding(role, TASK_SCOPE)
    await show()
    expect(seen[0]?.capabilities).toEqual(capabilities(role, TASK_SCOPE))
  })

  it('opens on ?tab= when it names one of this task’s tabs, and on the first when it names another', async () => {
    holding('view', TASK_SCOPE)
    await show(TOKEN, { tab: TAB_B })
    await show(TOKEN, { tab: '01M240FB4GD6PF6V0PKZVF6FZZ' })
    await show(TOKEN, { tab: [TAB_B, TAB_B] })
    expect(seen.map((one) => one.initialTabId)).toEqual([TAB_B, TAB_A, TAB_A])
  })

  it('binds every tab write to this token, so a create goes out under it', async () => {
    holding('write', TASK_SCOPE)
    await show()
    const created = await seen[0]?.actions.create({ projectId: P, taskId: T1 }, 'Added')
    expect(created).toMatchObject({ ok: true, value: { name: 'Added' } })
    expect(api.received.at(-1)).toMatchObject({ method: 'POST', bearer: TOKEN, body: { name: 'Added' } })
  })

  it('shows the API’s own sentence in place of a task it could not read', async () => {
    holding('view', TASK_SCOPE)
    api.answers.set(`GET /v1/microtask/projects/${P}/tasks/${T1}`, () => problemAnswer(500, 'The task store is busy.'))
    await show()
    expect(screen.getByText('The task store is busy.')).toBeTruthy()
    expect(screen.queryByTestId('workspace')).toBeNull()
  })

  it('draws no task list and no link to a sibling task', async () => {
    holding('manage', TASK_SCOPE)
    const { container } = await show()
    expect(container.querySelector(`a[href*="/t/"]`)).toBeNull()
    expect(container.textContent).not.toContain('Kickoff')
  })
})

describe('the head', () => {
  it.each([
    ['view', 'View only'],
    ['write', 'You can edit'],
    ['manage', 'You can edit'],
  ] as const)('badges a %s link %j', async (role, badge) => {
    holding(role, TASK_SCOPE)
    await show()
    expect(screen.getByText(badge)).toBeTruthy()
  })

  it('says overall progress for a task with checklist items', async () => {
    holding('view', TASK_SCOPE)
    await show()
    expect(screen.getByText('Overall progress: 50%')).toBeTruthy()
  })

  it('says the client’s own sentence for a project with no checklist items, where the admin says No tasks yet', async () => {
    holding('view', PROJECT_SCOPE)
    api.answers.set('GET /v1/microtask/shares/current', () =>
      Response.json({ role: 'view', scope: PROJECT_SCOPE, project: { id: P, name: 'Launch' }, folders: [], tasks: [] }),
    )
    await show()
    expect(screen.getByText('A shared project workspace')).toBeTruthy()
    expect(screen.queryByText('No tasks yet')).toBeNull()
  })
})

describe('Share, in exactly the form capabilities() allows', () => {
  it.each(['view', 'write'] as const)('draws no Share for a %s link', async (role) => {
    holding(role, PROJECT_SCOPE)
    await show()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it.each(['view', 'write'] as const)('draws no Share on a %s link’s task page', async (role) => {
    holding(role, TASK_SCOPE)
    await show()
    expect(screen.getByTestId('workspace')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('offers a project-scoped manage link every task and the whole project, behind a confirm naming what it opens', async () => {
    holding('manage', PROJECT_SCOPE)
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = screen.getByRole('dialog')
    const opens = within(dialog).getByRole<HTMLSelectElement>('combobox', { name: 'Opens' })
    expect([...opens.options].map((one) => one.textContent)).toEqual(['Go-live', 'Kickoff', 'Whole project'])
    await userEvent.selectOptions(opens, 'Whole project')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Who is this link for?' }), 'Everyone{Enter}')
    expect(screen.getByRole('heading', { name: 'Share the whole project?' })).toBeTruthy()
    expect(document.body.textContent).toContain('Folders: ACME. Tasks: Go-live, Kickoff.')
    await userEvent.click(screen.getByRole('button', { name: 'Add project link' }))
    expect(api.received.at(-1)).toMatchObject({ method: 'POST', path: `/v1/microtask/projects/${P}/share-links`, bearer: TOKEN, body: { scope: PROJECT_SCOPE } })
  })

  it('gives a task-scoped manage link a create-only Share that never asks for the list', async () => {
    holding('manage', TASK_SCOPE)
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Add link' })).toBeTruthy()
    expect(within(dialog).getByText(/You can create links here, but not list, rename or revoke them/)).toBeTruthy()
    expect(api.received.some((one) => one.path.endsWith('/share-links'))).toBe(false)
  })

  it('counts a project-scoped manage link’s links on the server and renders no other token', async () => {
    holding('manage', PROJECT_SCOPE)
    const element: ReactNode = await LinkPage(props())
    const { container } = render(element)
    expect(screen.getByText('1 share link')).toBeTruthy()
    expect(container.innerHTML).not.toContain(OTHER)
    const handed = stringsIn(element).filter((one) => one.includes('tok_'))
    expect(handed.filter((one) => one.includes(OTHER))).toEqual([])
    expect(handed.every((one) => one.includes(TOKEN))).toBe(true)
  })
})

describe('a project-scoped link lands on its task list', () => {
  it('lists its tasks by folder, each linking to /s/<token>/t/<taskId>', async () => {
    holding('view', PROJECT_SCOPE)
    const { container } = await show()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Launch')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('ACME')
    const links = [...container.querySelectorAll('li a')].map((one) => [one.textContent, one.getAttribute('href')])
    expect(links).toEqual([
      ['Go-live', `/s/${TOKEN}/t/${T1}`],
      ['Kickoff', `/s/${TOKEN}/t/${T2}`],
    ])
    expect(screen.queryByTestId('workspace')).toBeNull()
  })

  it('reads no task for the list, only what the token reaches', async () => {
    holding('view', PROJECT_SCOPE)
    await show()
    expect(api.received.map((one) => one.path)).toEqual(['/v1/microtask/shares/current'])
  })
})

describe('the URL token is the only authority on /s/*', () => {
  it('never reads a cookie or a header, with an admin session on the same browser', async () => {
    holding('manage', PROJECT_SCOPE)
    await show()
    holding('write', TASK_SCOPE)
    await show()
    await generateMetadata(props())
    expect(consulted).toEqual([])
    expect(new Set(api.received.map((one) => one.bearer))).toEqual(new Set([TOKEN]))
  })

  it('resolves the token in this URL, whichever link this browser opened before', async () => {
    holding('write', TASK_SCOPE)
    holding('view', PROJECT_SCOPE, OTHER)
    await show(OTHER)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Launch')
    expect(api.received.every((one) => one.bearer === OTHER)).toBe(true)
  })
})

describe('a link that no longer resolves', () => {
  it('goes to the terminal page on a 401, and never to /login', async () => {
    expect(await redirectOf(LinkPage(props()))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('goes to the terminal page when the link is revoked between resolving and reading back', async () => {
    holding('view', TASK_SCOPE)
    api.answers.set('GET /v1/microtask/shares/current', () => problemAnswer(404))
    expect(await redirectOf(LinkPage(props()))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('goes to the terminal page without a request for a segment that cannot be a token', async () => {
    expect(await redirectOf(LinkPage(props('not-a-token')))).toBe(LINK_UNAVAILABLE_PATH)
    expect(api.received).toEqual([])
  })

  it('shows an unreachable API as that, not as a dead link', async () => {
    api.answers.set('GET /v1/microtask/shares/current', () => {
      throw new TypeError('fetch failed')
    })
    await show()
    expect(screen.getByText(SERVICE_UNAVAILABLE)).toBeTruthy()
  })
})

describe('generateMetadata', () => {
  it('titles a task-scoped link with its task and a project-scoped one with its project', async () => {
    holding('view', TASK_SCOPE)
    expect(await generateMetadata(props())).toEqual({ title: 'Go-live · CC Guild Microtask' })
    holding('view', PROJECT_SCOPE)
    expect(await generateMetadata(props())).toEqual({ title: 'Launch · CC Guild Microtask' })
  })
})
