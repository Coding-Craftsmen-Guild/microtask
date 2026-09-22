import type { Project } from '@repo/api-client'
import type { ProjectScopeValue } from '@repo/contracts'

/** The project. */
export const P = '01HZZZZZZZZZZZZZZZZZZZZZP1'

/** The one folder, `ACME`. */
export const F1 = '01HZZZZZZZZZZZZZZZZZZZZZF1'

/** `Go-live`, first in `ACME`, with two task-scoped links. */
export const T1 = '01HZZZZZZZZZZZZZZZZZZZZZT1'

/** `DNS cutover`, second in `ACME`. */
export const T2 = '01HZZZZZZZZZZZZZZZZZZZZZT2'

/** `Kickoff`, at the root. */
export const T3 = '01HZZZZZZZZZZZZZZZZZZZZZT3'

/** Every token the fixture's links hold, each one live. */
export const LIVE_TOKENS = [
  'tok_LIVEONELIVEONELIVEONELIVE',
  'tok_LIVETWOLIVETWOLIVETWOLIVE',
  'tok_PROJECTWIDEPROJECTWIDEPRO',
] as const

const STAMP = '2026-09-11T10:00:00.000Z'

const entry = (id: string, name: string, folderId: string | null, [position, done, total]: readonly number[]) => ({
  id,
  name,
  folderId,
  position: position ?? 0,
  progress: { done: done ?? 0, total: total ?? 0 },
  updatedAt: STAMP,
  tabCount: 1,
  tabNames: ['General'],
})

const seat = (token: string, scope: ProjectScopeValue) => ({
  token,
  name: 'Client',
  role: 'write' as const,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

/** A project as `projects.read()` answers an admin: three live links, tokens and all. */
export const fixtureProject = (): Project => ({
  id: P,
  name: 'Launch',
  folders: [{ id: F1, name: 'ACME', position: 0, createdAt: STAMP, updatedAt: STAMP }],
  tasks: [
    entry(T3, 'Kickoff', null, [0, 0, 0]),
    entry(T2, 'DNS cutover', F1, [1, 2, 3]),
    entry(T1, 'Go-live', F1, [0, 1, 4]),
  ],
  shareLinks: [
    seat(LIVE_TOKENS[0], { kind: 'task', projectId: P, taskId: T1 }),
    seat(LIVE_TOKENS[1], { kind: 'task', projectId: P, taskId: T1 }),
    seat(LIVE_TOKENS[2], { kind: 'project', projectId: P }),
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
})
