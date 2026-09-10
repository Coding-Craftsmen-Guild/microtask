import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { manifestFile, projectDir, projectsDir, taskFile } from './paths.js'

const ROOT = path.resolve('/data')
const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'

describe('projectDir', () => {
  it('places a project under its product root', () => {
    expect(projectDir(ROOT, 'microtask', P)).toBe(
      path.join(ROOT, 'microtask', 'projects', P),
    )
  })

  it.each(['../../etc', '..', 'a/b', 'not-a-ulid', '', 'IIIIIIIIIIIIIIIIIIIIIIIIII'])(
    'refuses %s as a project id',
    (bad) => {
      expect(() => projectDir(ROOT, 'microtask', bad)).toThrow(Invalid)
    },
  )

  it('refuses an unknown product', () => {
    expect(() => projectDir(ROOT, 'other' as 'microtask', P)).toThrow(Invalid)
  })
})

describe('projectsDir', () => {
  it('places every product in its own root', () => {
    expect(projectsDir(ROOT, 'microtask')).toBe(path.join(ROOT, 'microtask', 'projects'))
    expect(projectsDir(ROOT, 'macroplan')).toBe(path.join(ROOT, 'macroplan', 'projects'))
  })

  it('refuses an unknown product', () => {
    expect(() => projectsDir(ROOT, 'other' as 'microtask')).toThrow(Invalid)
  })
})

describe('manifestFile', () => {
  it('names the manifest inside the project directory', () => {
    expect(manifestFile(ROOT, 'microtask', P)).toBe(
      path.join(ROOT, 'microtask', 'projects', P, 'project.json'),
    )
  })
})

describe('taskFile', () => {
  it('names a task file inside the project tasks directory', () => {
    expect(taskFile(ROOT, 'microtask', P, T)).toBe(
      path.join(ROOT, 'microtask', 'projects', P, 'tasks', `${T}.json`),
    )
  })

  it.each(['../../../secret', '..', 'not-a-ulid'])('refuses %s as a task id', (bad) => {
    expect(() => taskFile(ROOT, 'microtask', P, bad)).toThrow(Invalid)
  })

  it('never escapes the data root', () => {
    const built = taskFile(ROOT, 'microtask', P, T)
    expect(built.startsWith(ROOT + path.sep)).toBe(true)
  })
})
