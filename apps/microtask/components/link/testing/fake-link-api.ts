import type { ProjectScopeValue, RoleValue } from '@repo/contracts'

/** One request the fake API received, as the wire carried it. */
export interface Received {
  readonly method: string
  readonly path: string
  readonly bearer: string | undefined
  readonly body: unknown
}

/** A share the fake API resolves one bearer to. */
export interface FakeShare {
  readonly role: RoleValue
  readonly scope: ProjectScopeValue
}

/** What the fake API holds, all of it live and all of it keyed by what the wire would name. */
export interface FakeLinkApiState {
  /** Bearer → the share it names. A bearer not here is answered 401, as a revoked token is. */
  readonly shares: Map<string, FakeShare>
  /** Every request, in order. */
  readonly received: Received[]
  /** Overrides by `METHOD path`, answered before anything else. */
  readonly answers: Map<string, () => Response>
  /** The share links `GET …/share-links` answers, every token live. */
  shareLinks: readonly Record<string, unknown>[]
}

const STAMP = '2026-09-11T10:00:00.000Z'

/** The project every fixture here sits in. */
export const P = '01M240ERCRWWCN16Q5AHP1FZAQ'

/** `Go-live`, in the folder `ACME`: two tabs, one checklist item done of two. */
export const T1 = '01M240FB4GD6PF6V0PKZVF6FD9'

/** `Kickoff`, at the root. */
export const T2 = '01M240FB4GD6PF6V0PKZVF6FD8'

/** The folder. */
export const F1 = '01M240FB4GD6PF6V0PKZVF6FD7'

/** Go-live's first tab, `General`, stored second so the page is seen to sort. */
export const TAB_A = '01M240FB4GD6PF6V0PKZVF6FDA'

/** Go-live's second tab, `DNS`, stored first. */
export const TAB_B = '01M240FB4GD6PF6V0PKZVF6FDB'

const checklist = (checked: readonly boolean[]) => ({
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: checked.map((on) => ({
        type: 'taskItem',
        attrs: { checked: on },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: on ? 'done' : 'todo' }] }],
      })),
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'the runbook',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/runbook' } }],
        },
      ],
    },
  ],
})

const tab = (id: string, name: string, position: number, checked: readonly boolean[]) => ({
  id,
  name,
  position,
  document: checklist(checked),
  createdAt: STAMP,
  updatedAt: `${id}-S1`,
})

const entry = (id: string, name: string, folderId: string | null, progress: { done: number; total: number }) => ({
  id,
  name,
  folderId,
  position: 0,
  progress,
  updatedAt: STAMP,
  tabCount: 2,
  tabNames: ['General', 'DNS'],
})

/** Go-live as `tasks.read` answers it. */
export const goLive = () => ({
  projectId: P,
  id: T1,
  name: 'Go-live',
  position: 0,
  folder: null,
  progress: { done: 1, total: 2 },
  tabs: [tab(TAB_B, 'DNS', 1, []), tab(TAB_A, 'General', 0, [true, false])],
  createdAt: STAMP,
  updatedAt: STAMP,
})

const shareView = (share: FakeShare) => ({
  role: share.role,
  scope: share.scope,
  project: { id: P, name: 'Launch' },
  folders: share.scope.kind === 'project' ? [{ id: F1, name: 'ACME', position: 0, createdAt: STAMP, updatedAt: STAMP }] : [],
  tasks:
    share.scope.kind === 'project'
      ? [entry(T2, 'Kickoff', null, { done: 0, total: 0 }), entry(T1, 'Go-live', F1, { done: 1, total: 2 })]
      : [entry(T1, 'Go-live', null, { done: 1, total: 2 })],
})

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

/** A problem document in the API's own shape. */
export const problemAnswer = (status: number, detail = `status ${String(status)}`): Response =>
  json(status, { type: '/problems/x', title: 't', status, code: status === 401 ? 'unknown_principal' : 'x', detail, instance: '/v1/x' })

const route = (state: FakeLinkApiState, method: string, path: string, share: FakeShare): Response => {
  if (method === 'GET' && path === '/v1/microtask/shares/current') return json(200, shareView(share))
  if (method === 'GET' && path === `/v1/microtask/projects/${P}/tasks/${T1}`) return json(200, goLive())
  if (method === 'GET' && path === `/v1/microtask/projects/${P}/share-links`) return json(200, { shareLinks: state.shareLinks })
  if (method === 'POST' && path === `/v1/microtask/projects/${P}/tasks/${T1}/tabs`) {
    return json(201, tab('01M240FB4GD6PF6V0PKZVF6FDC', 'Added', 2, []))
  }
  return problemAnswer(404, 'Not found')
}

/** A fresh, empty fake. */
export const fakeLinkApiState = (): FakeLinkApiState => ({
  shares: new Map(),
  received: [],
  answers: new Map(),
  shareLinks: [],
})

/**
 * A `fetch` answering as `apps/api` would for the routes a link page calls, keyed on the bearer —
 * so a request presenting the wrong credential gets the wrong answer, not a lenient one.
 */
export const fakeLinkFetch =
  (state: FakeLinkApiState) =>
  (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET'
    const path = new URL(url).pathname
    const headers = (init.headers ?? {}) as Record<string, string>
    const bearer = headers['authorization']?.replace(/^Bearer /, '')
    state.received.push({ method, path, bearer, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) })
    const override = state.answers.get(`${method} ${path}`)
    if (override !== undefined) return Promise.resolve(override())
    const share = bearer === undefined ? undefined : state.shares.get(bearer)
    return Promise.resolve(share === undefined ? problemAnswer(401) : route(state, method, path, share))
  }
