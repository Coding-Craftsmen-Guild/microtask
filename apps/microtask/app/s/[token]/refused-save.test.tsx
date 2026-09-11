import { act, cleanup, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from '../../../components/editor/autosave'
import { DocumentEditor } from '../../../components/editor/document-editor'
import { REFUSED_COST } from '../../../components/editor/save-copy'
import { saveTabDocument, tabDocumentUrl, type Fetch } from '../../../components/tabs/save-tab'
import { DOCUMENT_REFUSALS } from '../../../lib/refusal'

vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a link save must not read a cookie')
  },
}))

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'
const HOST = 'microtask.example'
const ROOT = `/s/${TOKEN}/api/projects/${PROJECT}/tasks/${TASK}/tabs`
const DOCUMENT = { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }

const writes: string[] = []
let apiAnswer: () => Response = () => Response.json({ updatedAt: 'S2' })

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

const { PUT } = await import('./api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route')

const browserRequest = (url: string, init: RequestInit): Request =>
  ({
    url: `http://${HOST}${url}`,
    method: init.method,
    headers: new Headers({ ...(init.headers as Record<string, string>), host: HOST, origin: `https://${HOST}` }),
    json: () => Promise.resolve(JSON.parse(String(init.body))),
  }) as unknown as Request

const throughTheRoute: Fetch = (url, init) =>
  PUT(browserRequest(url, init), {
    params: Promise.resolve({ token: TOKEN, projectId: PROJECT, taskId: TASK, tabId: TAB }),
  })

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const typeInto = async (): Promise<Editor> => {
  const { container } = await act(async () =>
    render(
      <DocumentEditor
        document={DOCUMENT}
        editable
        onReload={() => undefined}
        save={saveTabDocument(tabDocumentUrl(ROOT, TAB), throughTheRoute)}
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

describe('a link page whose link was revoked while it was open, through the real route and island', () => {
  it('stops after one refused save, however long the page stays open, instead of retrying every four seconds', async () => {
    apiAnswer = () => apiProblem(401, 'unknown_principal', 'The bearer token does not name anyone.')
    await typeInto()
    expect(writes).toHaveLength(1)
    await settle(SAVE_RETRY_MS * 150)
    expect(writes).toHaveLength(1)
  })

  it('says so plainly, keeps the edit in the editor to be copied out, and never says retrying', async () => {
    apiAnswer = () => apiProblem(401, 'unknown_principal', 'The bearer token does not name anyone.')
    const editor = await typeInto()
    expect(screen.getByRole('status').textContent).toBe('Not saved')
    const alert = screen.getByRole('alert').textContent
    expect(alert).toContain(DOCUMENT_REFUSALS.link.unauthorised)
    expect(alert).toContain(REFUSED_COST)
    expect(document.body.textContent).not.toMatch(/retrying|bearer/)
    expect(editor.getText()).toBe('Hello world')
  })

  it('writes again once, and lands, only when Try again is chosen', async () => {
    apiAnswer = () => apiProblem(401, 'unknown_principal', 'The bearer token does not name anyone.')
    await typeInto()
    apiAnswer = () => Response.json({ updatedAt: 'S2' })
    act(() => {
      screen.getByRole('button', { name: 'Try again' }).click()
    })
    await settle(0)
    expect(writes).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })
})

describe('a link downgraded to view while its page was open', () => {
  it('says the link is read-only now, never "Not permitted: tab:write", and stops', async () => {
    apiAnswer = () => apiProblem(403, 'forbidden', 'Not permitted: tab:write')
    await typeInto()
    expect(screen.getByRole('alert').textContent).toContain(DOCUMENT_REFUSALS.link.forbidden)
    expect(document.body.textContent).not.toContain('Not permitted')
    await settle(SAVE_RETRY_MS * 10)
    expect(writes).toHaveLength(1)
  })
})

describe('a save the API could not answer', () => {
  it('still retries every four seconds, since the same write can land once the API is back', async () => {
    apiAnswer = () => apiProblem(503, 'service_unavailable', 'down')
    await typeInto()
    expect(screen.getByRole('status').textContent).toContain('Not saved — retrying…')
    await settle(SAVE_RETRY_MS * 2)
    expect(writes).toHaveLength(3)
  })
})
