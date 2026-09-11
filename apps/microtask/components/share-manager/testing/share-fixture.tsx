import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ShareManager } from '../share-manager'
import type { Link, ScopeChoice, ShareActions, ShareControls } from '../types'

/** The project. */
export const P = '01HZZZZZZZZZZZZZZZZZZZZZP1'

/** `Go-live`, the first task. */
export const T1 = '01HZZZZZZZZZZZZZZZZZZZZZT1'

/** `Kickoff`, the second task. */
export const T2 = '01HZZZZZZZZZZZZZZZZZZZZZT2'

/** A live token belonging to Jane's link. */
export const JANE = 'tok_JANEJANEJANEJANEJANEJANE'

/** A live token belonging to the unnamed link. */
export const BLANK = 'tok_BLANKBLANKBLANKBLANKBLAN'

/** What the create form offers, tasks first so a task is the default scope (ADR 0011). */
export const choices: readonly ScopeChoice[] = [
  { value: T1, label: 'Go-live', scope: { kind: 'task', projectId: P, taskId: T1 } },
  { value: T2, label: 'Kickoff', scope: { kind: 'task', projectId: P, taskId: T2 } },
  { value: 'project', label: 'Whole project', scope: { kind: 'project', projectId: P } },
]

/** A link, Jane's by default. */
export const link = (overrides: Partial<Link> = {}): Link => ({
  token: JANE,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'task', projectId: P, taskId: T1 },
  createdBy: null,
  createdAt: '2026-09-11T10:00:00.000Z',
  ...overrides,
})

/** Jane's link, and a project-scoped `manage` link with no name. */
export const links = (): Link[] => [
  link(),
  link({ token: BLANK, name: '', role: 'manage', scope: { kind: 'project', projectId: P } }),
]

/** Every share action as a recording double that succeeds. */
export const fakeShareActions = () => ({
  list: vi.fn<ShareActions['list']>(() => Promise.resolve({ ok: true, value: links() })),
  create: vi.fn<ShareActions['create']>((_p, seat) =>
    Promise.resolve({ ok: true, value: link({ token: 'tok_NEWNEWNEWNEWNEWNEWNEWNE', name: seat.name, role: seat.role }) }),
  ),
  update: vi.fn<ShareActions['update']>((_p, token, change) => {
    const current = links().find((one) => one.token === token) ?? link()
    const value = { ...current, name: change.name ?? current.name, role: change.role ?? current.role }
    return Promise.resolve({ ok: true, value })
  }),
  revoke: vi.fn<ShareActions['revoke']>((_p, token) =>
    Promise.resolve({ ok: true, value: links().filter((one) => one.token === token) }),
  ),
})

/** An admin's share controls: everything. */
export const ALL: ShareControls = { read: true, create: true, update: true, revoke: true }

/** What a test may vary about the manager it renders. */
export interface ShareSetup {
  /** The controls, {@link ALL} by default. */
  readonly controls?: ShareControls
  /** The server-rendered count, 2 by default. */
  readonly count?: number | undefined
  /** The task a task page's manager is scoped to; absent for the project page's. */
  readonly taskId?: string
}

/** Renders the manager, answering the doubles and a user to drive it. */
export const renderManager = (setup: ShareSetup = {}) => {
  const actions = fakeShareActions()
  const view = render(
    <ShareManager
      actions={actions}
      choices={choices}
      controls={setup.controls ?? ALL}
      count={'count' in setup ? setup.count : 2}
      exposure="Folders: ACME. Tasks: Go-live, Kickoff."
      projectId={P}
      {...(setup.taskId === undefined ? {} : { taskId: setup.taskId })}
    />,
  )
  return { actions, view, user: userEvent.setup() }
}
