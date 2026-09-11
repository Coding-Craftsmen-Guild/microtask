import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoleValue, ScopeValue } from '@repo/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Redirected } from '../../../actions/testing/fake-admin'
import { fakeLinkApiState, fakeLinkFetch, P, T1, type FakeLinkApiState } from '../../../components/link/testing/fake-link-api'

vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a link page must not read a cookie')
  },
  headers: () => {
    throw new Error('a link page must not read a header')
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

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const TASK_SCOPE: ScopeValue = { kind: 'task', projectId: P, taskId: T1 }

let api: FakeLinkApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakeLinkApiState()
  vi.stubGlobal('fetch', fakeLinkFetch(api))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { default: LinkPage } = await import('./page')

const open = async (role: RoleValue) => {
  api.shares.set(TOKEN, { role, scope: TASK_SCOPE })
  const page = await LinkPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({}) })
  const view = await act(async () => render(page))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

const surface = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('.ProseMirror')
  if (found === null) throw new Error('no editor surface')
  return found
}

describe('a view link, through the real tab strip and editor', () => {
  it('gets a non-editable editor, no toolbar and no +', async () => {
    const { container } = await open('view')
    expect(surface(container).getAttribute('contenteditable')).toBe('false')
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull()
  })

  it('snaps a clicked checkbox back, and saves nothing', async () => {
    const { container } = await open('view')
    const box = container.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')
    if (box === null) throw new Error('no checkbox')
    const before = box.checked
    await userEvent.click(box)
    expect(box.checked).toBe(before)
    expect(api.received.filter((one) => one.method === 'PUT')).toEqual([])
  })

  it('renders a document link that opens in a new tab and sends no referrer', async () => {
    const { container } = await open('view')
    const link = container.querySelector('.ProseMirror a[href="https://example.com/runbook"]')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer', 'nofollow']))
  })
})

describe('a write link, through the same components', () => {
  it('gets an editable editor with its toolbar, and +', async () => {
    const { container } = await open('write')
    expect(surface(container).getAttribute('contenteditable')).toBe('true')
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy()
  })
})
