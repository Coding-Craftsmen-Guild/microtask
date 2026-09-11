import { capabilities } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeShareActions } from '../share-manager/testing/share-fixture'
import { ADMIN_CAPABILITIES } from '../task-tree/controls'
import { projectPageModel } from './page-model'
import { ProjectHeader } from './project-header'
import { fixtureProject, P, T1 } from './testing/project-fixture'

const setup = (can = ADMIN_CAPABILITIES) => {
  const onRename = vi.fn((_id: string, name: string) => Promise.resolve({ ok: true as const, value: name }))
  render(<ProjectHeader can={can} model={projectPageModel(fixtureProject())} onRename={onRename} share={fakeShareActions()} />)
  return { onRename, user: userEvent.setup() }
}

describe('ProjectHeader', () => {
  it('renames this project from its title', async () => {
    const { onRename, user } = setup()
    const title = screen.getByRole('textbox', { name: 'Project name' })
    await user.clear(title)
    await user.type(title, 'Launch v2{Enter}')
    expect(onRename).toHaveBeenCalledWith(P, 'Launch v2')
  })

  it('draws the title as text where renaming the project is not drawn', () => {
    setup(capabilities('write', { kind: 'project', projectId: P }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Launch')
    expect(screen.queryByRole('textbox', { name: 'Project name' })).toBeNull()
  })

  it('draws no share manager for a holder who can neither list nor mint', () => {
    setup(capabilities('write', { kind: 'project', projectId: P }))
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('draws Share for a task-scoped manage holder, who may mint but never list', () => {
    setup(capabilities('manage', { kind: 'task', projectId: P, taskId: T1 }))
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
  })

  it('says "No tasks yet" for a project with no checklist items', () => {
    const empty = { ...fixtureProject(), tasks: [] }
    render(<ProjectHeader can={ADMIN_CAPABILITIES} model={projectPageModel(empty)} onRename={vi.fn()} share={fakeShareActions()} />)
    expect(screen.getByText('No tasks yet')).toBeTruthy()
  })
})
