import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import type { TaskWorkspaceProps } from '../../../../../../components/tabs/task-workspace'
import type { TaskRead } from './read-task'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'

let answer: TaskRead
const seen: TaskWorkspaceProps[] = []

vi.mock('./read-task', () => ({ readTask: () => Promise.resolve(answer) }))
vi.mock('../../../../../../actions/tabs', () => ({
  createTab: vi.fn(),
  renameTab: vi.fn(),
  deleteTab: vi.fn(),
  reorderTabs: vi.fn(),
}))
vi.mock('../../../../../../components/tabs/task-workspace', () => ({
  TaskWorkspace: (props: TaskWorkspaceProps) => {
    seen.push(props)
    return <div data-testid="workspace" />
  },
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}))

const page = await import('./page')
const actions = await import('../../../../../../actions/tabs')
const { ADMIN_CAPABILITIES } = await import('../../../../../../components/tabs/tab-controls')
const { TaskWorkspace } = await import('../../../../../../components/tabs/task-workspace')

const workspaceKey = (node: unknown): string | null | undefined => {
  if (Array.isArray(node)) return node.map(workspaceKey).find((key) => key !== undefined)
  if (!isValidElement<{ children?: unknown }>(node)) return undefined
  if (node.type === TaskWorkspace) return node.key
  return workspaceKey(node.props.children)
}

const tab = (id: string, position: number) => ({
  id,
  name: `Tab ${id}`,
  position,
  document: { type: 'doc' as const, content: [] },
  createdAt: 'S0',
  updatedAt: 'S1',
})

const task = (tabs: ReturnType<typeof tab>[]) => ({
  projectId: P,
  id: T,
  name: 'Go-live',
  position: 0,
  folder: null,
  progress: { done: 0, total: 0 },
  tabs,
  createdAt: 'S0',
  updatedAt: 'S1',
})

const props = (query: Record<string, string | string[] | undefined> = {}) => ({
  params: Promise.resolve({ projectId: P, taskId: T }),
  searchParams: Promise.resolve(query),
})

const show = async (query: Record<string, string | string[] | undefined> = {}) =>
  render(await page.default(props(query)))

beforeEach(() => {
  seen.length = 0
  answer = { ok: true, value: task([tab('b', 1), tab('a', 0), tab('c', 2)]) }
})

describe('the task page', () => {
  it('hands the workspace the task’s tabs in position order', async () => {
    await show()
    expect(seen[0]?.tabs.map((one) => one.id)).toEqual(['a', 'b', 'c'])
  })

  it('opens on ?tab= when it names one of this task’s tabs', async () => {
    await show({ tab: 'c' })
    expect(seen[0]?.initialTabId).toBe('c')
  })

  it('opens on the first tab when ?tab= names a tab this task does not hold', async () => {
    await show({ tab: 'somebody-elses' })
    expect(seen[0]?.initialTabId).toBe('a')
  })

  it('renders for the admin audience, with every capability, the admin save root and the tab actions', async () => {
    await show()
    expect(seen[0]).toMatchObject({
      audience: 'admin',
      capabilities: ADMIN_CAPABILITIES,
      documentRoot: `/api/projects/${P}/tasks/${T}/tabs`,
      task: { projectId: P, taskId: T },
    })
    expect(seen[0]?.actions).toEqual({
      create: actions.createTab,
      rename: actions.renameTab,
      remove: actions.deleteTab,
      reorder: actions.reorderTabs,
    })
  })

  it('keys the workspace on the task, so moving to another task mounts a fresh one', async () => {
    expect(workspaceKey(await page.default(props()))).toBe(T)
  })

  it('heads the page with the task name and links back to its project, never to /login', async () => {
    const { container } = await show()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Go-live')
    expect(screen.getByRole('link', { name: '← Back to project' }).getAttribute('href')).toBe(`/p/${P}`)
    expect(container.querySelector('a[href^="/login"]')).toBeNull()
  })

  it('shows a refusal in place of the document, with no strip and no editor', async () => {
    answer = { ok: false, status: 0, detail: 'Microtask could not reach its API. Try again in a moment.' }
    await show()
    expect(screen.getByText('Microtask could not reach its API. Try again in a moment.')).toBeTruthy()
    expect(screen.queryByTestId('workspace')).toBeNull()
  })

  it('shows an empty state rather than a workspace for a task with no tabs', async () => {
    answer = { ok: true, value: task([]) }
    await show()
    expect(screen.getByText('This task has no tabs.')).toBeTruthy()
    expect(seen).toHaveLength(0)
  })
})

describe('the task page title', () => {
  it('is the task name and the product, as legacy titled a project', async () => {
    expect(await page.generateMetadata(props())).toEqual({ title: 'Go-live · CC Guild Microtask' })
  })

  it('falls back to the generic title when the task could not be read', async () => {
    answer = { ok: false, status: 500, detail: 'x' }
    expect(await page.generateMetadata(props())).toEqual({ title: 'Task · CC Guild Microtask' })
  })
})
