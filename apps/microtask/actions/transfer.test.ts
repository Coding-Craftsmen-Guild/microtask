import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, problem, Redirected, redirectOf, type FakeAdmin } from './testing/fake-admin'

let fake: FakeAdmin
let session: 'present' | 'absent' = 'present'

vi.mock('../lib/api', () => ({
  apiForSession: () => Promise.resolve(session === 'present' ? asClient(fake) : null),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))

const { confirmImport, expandImportArchive, openImportSession, previewImport } = await import('./transfer')

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'
const PROJECT = '01M240FB4GD6PF6V0PKZVF6FD9'

const opened = { sessionId: SESSION, openedAt: 'S', maxChunkBytes: 1_000_000, maxSessionBytes: 40_000_000 }

beforeEach(() => {
  fake = fakeAdmin()
  session = 'present'
  fake.transfer.openSession.mockResolvedValue(opened)
  fake.transfer.preview.mockResolvedValue({ sessionId: SESSION, groups: [] })
  fake.transfer.confirm.mockResolvedValue({ sessionId: SESSION, projects: [] })
  fake.transfer.expandArchive.mockResolvedValue({ archive: 'drop.zip', files: 2, bytes: 9, sessionBytes: 9 })
})

describe('the transfer actions are actions, because none of them moves bytes (ADR 0015)', () => {
  it('opens a session and answers the caps the browser slices by', async () => {
    const result = await openImportSession()
    expect(result).toEqual({ ok: true, value: opened })
    expect(fake.transfer.openSession).toHaveBeenCalledWith()
  })

  it('expands a staged archive by the path it was uploaded at', async () => {
    const result = await expandImportArchive(SESSION, 'drop.zip')
    expect(result.ok).toBe(true)
    expect(fake.transfer.expandArchive).toHaveBeenCalledWith(SESSION, 'drop.zip')
  })

  it('previews one session, which writes nothing', async () => {
    const result = await previewImport(SESSION)
    expect(result).toEqual({ ok: true, value: { sessionId: SESSION, groups: [] } })
    expect(fake.transfer.preview).toHaveBeenCalledWith(SESSION)
  })

  it('confirms by naming the session alongside the choices, sparse as they are', async () => {
    await confirmImport(SESSION, [{ projectId: PROJECT, choice: 'replace' }])
    expect(fake.transfer.confirm).toHaveBeenCalledWith({
      sessionId: SESSION,
      choices: [{ projectId: PROJECT, choice: 'replace' }],
    })
  })

  it('confirms a session with no collisions at all, which is an empty choice list', async () => {
    await confirmImport(SESSION, [])
    expect(fake.transfer.confirm).toHaveBeenCalledWith({ sessionId: SESSION, choices: [] })
  })
})

describe('the transfer actions re-derive authority from mt_admin on every call', () => {
  it.each([
    ['openImportSession', () => openImportSession()],
    ['previewImport', () => previewImport(SESSION)],
    ['confirmImport', () => confirmImport(SESSION, [])],
    ['expandImportArchive', () => expandImportArchive(SESSION, 'a.zip')],
  ])('sends %s to sign in when this browser presents no admin session', async (_name, call) => {
    session = 'absent'
    expect(await redirectOf(call())).toBe('/login?next=%2Ftransfer')
  })

  it.each([
    ['openImportSession', () => openImportSession()],
    ['previewImport', () => previewImport(SESSION)],
    ['confirmImport', () => confirmImport(SESSION, [])],
  ])('sends %s to sign in on a 401, keeping the page it was serving', async (_name, call) => {
    fake.transfer.openSession.mockRejectedValue(problem(401))
    fake.transfer.preview.mockRejectedValue(problem(401))
    fake.transfer.confirm.mockRejectedValue(problem(401))
    expect(await redirectOf(call())).toBe('/login?next=%2Ftransfer')
  })
})

describe('the transfer actions hand a refusal back as a sentence rather than a rejection', () => {
  it('reports a 403 on a preview, which is a credential the API will not let read a drop', async () => {
    fake.transfer.preview.mockRejectedValue(problem(403))
    const result = await previewImport(SESSION)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ status: 403 })
  })

  it('reports a 404 on a confirm, which is a session swept before it was applied', async () => {
    fake.transfer.confirm.mockRejectedValue(problem(404))
    expect(await confirmImport(SESSION, [])).toMatchObject({ ok: false, status: 404 })
  })

  it('reports a 409 on an expansion, which is an entry colliding with a staged path', async () => {
    fake.transfer.expandArchive.mockRejectedValue(problem(409))
    expect(await expandImportArchive(SESSION, 'a.zip')).toMatchObject({ ok: false, status: 409 })
  })

  it('passes a confirm that reports failures through as a success, per project (ADR 0018)', async () => {
    const failed = {
      path: 'drop/x',
      projectId: PROJECT,
      writtenProjectId: null,
      choice: null,
      outcome: 'failed',
      tasksWritten: 0,
      tasksRemoved: 0,
      shareLinksReminted: 0,
      shareLinksStranded: 0,
      reasons: ['ENOSPC'],
    }
    fake.transfer.confirm.mockResolvedValue({ sessionId: SESSION, projects: [failed] })
    const result = await confirmImport(SESSION, [])
    expect(result).toEqual({ ok: true, value: { sessionId: SESSION, projects: [failed] } })
  })
})
