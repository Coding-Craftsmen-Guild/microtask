import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, Redirected, type FakeAdmin } from '../../../../../../actions/testing/fake-admin'
import { fixtureProject, LIVE_TOKENS, P, T1 } from '../../../../../../components/projects/testing/project-fixture'

let fake: FakeAdmin

vi.mock('../../../../../../lib/api', () => ({ apiForSession: () => Promise.resolve(asClient(fake)) }))
vi.mock('next/cache', () => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))
vi.mock('../../../../../../components/tabs/task-workspace', () => ({ TaskWorkspace: () => <div data-testid="workspace" /> }))

const { default: TaskPage } = await import('./page')

const props = () => ({
  params: Promise.resolve({ projectId: P, taskId: T1 }),
  searchParams: Promise.resolve({}),
})

const stringsIn = (value: unknown, seen = new WeakSet<object>()): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  const node = isValidElement(value) ? (value.props as object) : value
  return Object.values(node).flatMap((child: unknown) => stringsIn(child, seen))
}

const tab = { id: '01HZZZZZZZZZZZZZZZZZZZZZA1', name: 'General', position: 0, document: { type: 'doc', content: [] }, createdAt: 'S0', updatedAt: 'S1' }

beforeEach(() => {
  fake = fakeAdmin()
  fake.tasks.read.mockResolvedValue({ projectId: P, id: T1, name: 'Go-live', position: 0, folder: null, progress: { done: 0, total: 0 }, tabs: [tab], createdAt: 'S0', updatedAt: 'S1' })
  fake.shareLinks.list.mockResolvedValue({ shareLinks: fixtureProject().shareLinks })
})

describe('the task page, over a project holding live links', () => {
  it('counts this task’s links on the server and puts no token in the rendered output', async () => {
    const { container } = render(await TaskPage(props()))
    expect(screen.getByText('2 share links')).toBeTruthy()
    for (const token of LIVE_TOKENS) {
      expect(container.innerHTML).not.toContain(token)
      expect(document.body.innerHTML).not.toContain(token)
    }
  })

  it('hands no component a share token, which is what would land in the Flight payload', async () => {
    const element: ReactNode = await TaskPage(props())
    const handed = stringsIn(element)
    expect(handed).toContain('Go-live')
    for (const token of LIVE_TOKENS) expect(handed.filter((one) => one.includes(token))).toEqual([])
  })
})
