import { act, cleanup, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from '../../components/editor/autosave'
import { DocumentEditor } from '../../components/editor/document-editor'
import { saveTabDocument, tabDocumentUrl, type Fetch } from '../../components/tabs/save-tab'
import { DOCUMENT_REFUSALS } from '../../lib/refusal'

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'
const HOST = 'microtask.example'
const LINK_ROOT = `/s/${TOKEN}/api/projects/${PROJECT}/tasks/${TASK}/tabs`
const ADMIN_ROOT = `/api/projects/${PROJECT}/tasks/${TASK}/tabs`
const DOCUMENT = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }

const writes: string[] = []
let apiAnswer: () => Response | Promise<Response> = () => Response.json({ updatedAt: 'S2' })

const apiProblem = (status: number, code: string, detail: string): Response =>
  new Response(JSON.stringify({ type: `/problems/${code}`, title: 't', status, code, detail, instance: '/v1/x' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  writes.length = 0
  vi.stubGlobal('fetch', (url: string) => {
    writes.push(url)
    return Promise.resolve(apiAnswer())
  })
})

afterEach(async () => {
  cleanup()
  await vi.advanceTimersByTimeAsync(10)
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { PUT: LINK_PUT } = await import('../s/[token]/api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route')
const { PUT: ADMIN_PUT } = await import('../api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route')

const browserRequest = (url: string, init: RequestInit): Request =>
  ({
    url: `http://${HOST}${url}`,
    method: init.method,
    headers: new Headers({ ...(init.headers as Record<string, string>), host: HOST, origin: `https://${HOST}` }),
    json: () => Promise.resolve(JSON.parse(String(init.body))),
  }) as unknown as Request

const throughLinkRoute: Fetch = (url, init) =>
  LINK_PUT(browserRequest(url, init), {
    params: Promise.resolve({ token: TOKEN, projectId: PROJECT, taskId: TASK, tabId: TAB }),
  })

const throughAdminRoute: Fetch = (url, init) =>
  ADMIN_PUT(browserRequest(url, init), {
    params: Promise.resolve({ projectId: PROJECT, taskId: TASK, tabId: TAB }),
  })

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const typeInto = async (send: Fetch, root: string): Promise<Editor> => {
  const { container } = await act(async () =>
    render(
      <DocumentEditor
        document={DOCUMENT}
        editable
        onReload={() => undefined}
        save={saveTabDocument(tabDocumentUrl(root, TAB), send)}
        updatedAt="S1"
      />,
    ),
  )
  const editor = (container.querySelector('.ProseMirror') as unknown as { editor: Editor }).editor
  act(() => {
    editor.chain().setTextSelection(6).insertContent(' world').run()
  })
  await settle(SAVE_DEBOUNCE_MS)
  return editor
}

describe('a save the server will not take, through both surfaces’ real routes and the real island', () => {
  it('keeps retrying a request that never arrived, since the same write can land later', async () => {
    apiAnswer = () => Promise.reject(new TypeError('Failed to fetch')) as unknown as Response
    await typeInto(throughLinkRoute, LINK_ROOT)
    expect(writes).toHaveLength(1)
    await settle(SAVE_RETRY_MS * 3)
    expect(writes).toHaveLength(4)
    expect(screen.getByRole('status').textContent).toContain('Not saved — retrying…')
  })

  it('keeps retrying a 429, and says Microtask is busy rather than anything the API said', async () => {
    apiAnswer = () => apiProblem(429, 'too_many_requests', 'Rate limit exceeded: 100/min per key')
    await typeInto(throughLinkRoute, LINK_ROOT)
    await settle(SAVE_RETRY_MS * 2)
    expect(writes).toHaveLength(3)
    const said = document.body.textContent ?? ''
    expect(said).toContain(DOCUMENT_REFUSALS.link.busy)
    expect(said).not.toContain('Rate limit')
  })

  it('stops an admin whose session lapsed, and tells them to sign in again, on the admin route', async () => {
    apiAnswer = () => apiProblem(401, 'unknown_principal', 'The bearer token does not name anyone.')
    const editor = await typeInto(throughAdminRoute, ADMIN_ROOT)
    expect(screen.getByRole('status').textContent).toBe('Not saved')
    expect(screen.getByRole('alert').textContent).toContain(DOCUMENT_REFUSALS.admin.unauthorised)
    await settle(SAVE_RETRY_MS * 50)
    expect(writes).toHaveLength(0)
    expect(editor.getText()).toBe('Hello world')
  })

  it('sends nothing on a hidden page or an unload once refused, and still asks for the unsaved prompt', async () => {
    apiAnswer = () => apiProblem(403, 'forbidden', 'Not permitted: tab:write')
    await typeInto(throughLinkRoute, LINK_ROOT)
    expect(writes).toHaveLength(1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
    })
    const unload = new Event('beforeunload', { cancelable: true })
    await act(async () => {
      window.dispatchEvent(unload)
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(writes).toHaveLength(1)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('keeps every edit made after a refusal, and Try again sends the newest of them', async () => {
    apiAnswer = () => apiProblem(404, 'not_found', 'Tab not found')
    const editor = await typeInto(throughLinkRoute, LINK_ROOT)
    act(() => {
      editor.chain().setTextSelection(12).insertContent(' again').run()
    })
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(writes).toHaveLength(1)
    expect(editor.getText()).toBe('Hello world again')
    let sent = ''
    apiAnswer = () => Response.json({ updatedAt: 'S2' })
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      writes.push(url)
      sent = String(init.body)
      return Promise.resolve(apiAnswer())
    })
    act(() => {
      screen.getByRole('button', { name: 'Try again' }).click()
    })
    await settle(0)
    expect(writes).toHaveLength(2)
    expect(sent).toContain('Hello world again')
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })
})
