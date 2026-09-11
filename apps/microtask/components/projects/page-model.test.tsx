import { describe, expect, it } from 'vitest'
import { exposureOf, projectPageModel } from './page-model'
import { fixtureProject, LIVE_TOKENS, P, T1, T2, T3 } from './testing/project-fixture'

describe('projectPageModel', () => {
  it('carries no share token anywhere, however deep', () => {
    const serialised = JSON.stringify(projectPageModel(fixtureProject()))
    for (const token of LIVE_TOKENS) expect(serialised).not.toContain(token)
  })

  it('counts every link on the project, as the list does', () => {
    expect(projectPageModel(fixtureProject()).shareLinkCount).toBe(3)
  })

  it('counts nothing — not zero — when the caller was not shown the links', () => {
    const model = projectPageModel({ ...fixtureProject(), shareLinks: undefined })
    expect(model.shareLinkCount).toBeUndefined()
    expect(model.linkCounts).toBeUndefined()
  })

  it('counts each task’s own task-scoped links, leaving project-scoped ones to the project', () => {
    expect(projectPageModel(fixtureProject()).linkCounts).toEqual({ [T1]: 2 })
  })

  it('offers tasks as scopes in tree order, then the whole project', () => {
    const choices = projectPageModel(fixtureProject()).choices
    expect(choices.map((choice) => choice.label)).toEqual(['Go-live', 'DNS cutover', 'Kickoff', 'Whole project'])
    expect(choices[0]?.scope).toEqual({ kind: 'task', projectId: P, taskId: T1 })
    expect(choices.at(-1)?.scope).toEqual({ kind: 'project', projectId: P })
    expect([T2, T3].every((id) => choices.some((choice) => choice.value === id))).toBe(true)
  })

  it('sums the tasks’ cached progress for the project bar', () => {
    expect(projectPageModel(fixtureProject()).progress).toEqual({ done: 3, total: 7 })
  })
})

describe('exposureOf', () => {
  it('names every folder and task a project-scoped link would open', () => {
    expect(exposureOf(fixtureProject())).toBe(
      'This link opens everything in this project, including anything added later. Folders: ACME. Tasks: Go-live, DNS cutover, Kickoff.',
    )
  })

  it('says none where there are none', () => {
    expect(exposureOf({ folders: [], tasks: [] })).toBe(
      'This link opens everything in this project, including anything added later. Folders: none. Tasks: none.',
    )
  })
})
