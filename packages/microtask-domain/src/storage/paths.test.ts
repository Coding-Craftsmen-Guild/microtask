import { readFileSync, readdirSync } from 'node:fs'
import path, { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { normaliseImportPath } from '../import/harvested-path.js'
import {
  buildDir,
  buildRoot,
  manifestFile,
  projectDir,
  projectsDir,
  sessionMarkerFile,
  stagedFile,
  stagingDir,
  stagingRoot,
  taskFile,
} from './paths.js'

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

  it('places the task file under the data root', () => {
    const built = taskFile(ROOT, 'microtask', P, T)
    expect(built.startsWith(ROOT + path.sep)).toBe(true)
  })
})

describe('the staging root (ADR 0045)', () => {
  it('sits beside projects/ rather than under it, which is what listManifests cannot see', () => {
    expect(stagingRoot(ROOT, 'microtask')).toBe(path.join(ROOT, 'microtask', 'import'))
    expect(stagingRoot(ROOT, 'microtask').startsWith(projectsDir(ROOT, 'microtask'))).toBe(false)
  })

  it('keys every product to its own root', () => {
    expect(stagingRoot(ROOT, 'macroplan')).toBe(path.join(ROOT, 'macroplan', 'import'))
  })

  it('refuses an unknown product', () => {
    expect(() => stagingRoot(ROOT, 'other' as 'microtask')).toThrow(Invalid)
  })
})

describe('stagingDir', () => {
  it('names one session under the staging root', () => {
    expect(stagingDir(ROOT, 'microtask', P)).toBe(path.join(ROOT, 'microtask', 'import', P))
  })

  it.each(['../../etc', '..', 'a/b', 'not-a-ulid', '', 'IIIIIIIIIIIIIIIIIIIIIIIIII'])(
    'refuses %s as a session id',
    (bad) => {
      expect(() => stagingDir(ROOT, 'microtask', bad)).toThrow(Invalid)
    },
  )

  it('names the session id rather than the project id in its refusal', () => {
    expect(() => stagingDir(ROOT, 'microtask', 'nope')).toThrow('Import session id must be a ULID')
  })
})

describe('sessionMarkerFile', () => {
  it('sits in the session directory, outside the one uploads are written into', () => {
    expect(sessionMarkerFile(ROOT, 'microtask', P)).toBe(
      path.join(ROOT, 'microtask', 'import', P, 'session.json'),
    )
  })

  it('is unreachable by any upload, so a file called session.json cannot overwrite it', () => {
    const marker = sessionMarkerFile(ROOT, 'microtask', P)
    expect(stagedFile(ROOT, 'microtask', P, 'session.json')).not.toBe(marker)
    expect(stagedFile(ROOT, 'microtask', P, 'a/session.json')).not.toBe(marker)
  })
})

describe('stagedFile', () => {
  it('puts an upload under the session files directory, at the path it was harvested at', () => {
    expect(stagedFile(ROOT, 'microtask', P, `drop/${P}/project.json`)).toBe(
      path.join(ROOT, 'microtask', 'import', P, 'files', 'drop', P, 'project.json'),
    )
  })

  it('normalises with the one normaliser the server already has, rather than a second copy', () => {
    expect(stagedFile(ROOT, 'microtask', P, 'drop//./a/project.json')).toBe(
      stagedFile(ROOT, 'microtask', P, 'drop/a/project.json'),
    )
  })

  it('is a fixed point, so a caller may normalise first and pass the result in', () => {
    const once = normaliseImportPath('drop//./a/project.json')
    expect(stagedFile(ROOT, 'microtask', P, once)).toBe(
      stagedFile(ROOT, 'microtask', P, 'drop//./a/project.json'),
    )
  })

  it.each([
    '../../../secret',
    '..',
    '/etc/passwd',
    'C:/Windows/system32/config',
    'a\\..\\..\\b',
    'a/../../b',
    'drop/\u0000/project.json',
    'a/b/',
    '.',
  ])('refuses %j, which would address a file the drop did not contain', (hostile) => {
    expect(() => stagedFile(ROOT, 'microtask', P, hostile)).toThrow(Invalid)
  })

  it('stays under the session it names however the path is spelled', () => {
    const built = stagedFile(ROOT, 'microtask', P, 'drop/a/b/c/project.json')
    expect(built.startsWith(stagingDir(ROOT, 'microtask', P) + path.sep)).toBe(true)
  })
})

describe('the build root (ADR 0045)', () => {
  it('sits beside projects/ on the same volume, so publishing a project is a rename', () => {
    expect(buildRoot(ROOT, 'microtask')).toBe(path.join(ROOT, 'microtask', 'build'))
    expect(buildDir(ROOT, 'microtask', P)).toBe(path.join(ROOT, 'microtask', 'build', P))
  })

  it('is neither the projects root nor anything under it', () => {
    const projects = projectsDir(ROOT, 'microtask')
    expect(buildRoot(ROOT, 'microtask')).not.toBe(projects)
    expect(buildRoot(ROOT, 'microtask').startsWith(projects + path.sep)).toBe(false)
  })

  it.each(['../../etc', '..', 'a/b', 'not-a-ulid', ''])('refuses %s as a project id', (bad) => {
    expect(() => buildDir(ROOT, 'microtask', bad)).toThrow(Invalid)
  })

  it('refuses an unknown product', () => {
    expect(() => buildRoot(ROOT, 'other' as 'microtask')).toThrow(Invalid)
  })
})

describe('what the path builders are allowed to depend on', () => {
  const SRC = dirname(fileURLToPath(import.meta.url))

  const sources = (): readonly string[] =>
    readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
      .map((entry) => join(SRC, entry.name))

  const code = (file: string): string =>
    readFileSync(file, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '')

  it('walks the storage modules, so the ban below is not measured over nothing', () => {
    expect(sources().length).toBeGreaterThan(3)
  })

  it('reaches the harvested-path leaf and never the classifier, whose consumers would become theirs', () => {
    const importers = sources().filter((file) => /from '\.\.\/import\/grouping\.js'/u.test(code(file)))
    expect(importers).toEqual([])
    const leaf = sources().filter((file) => /from '\.\.\/import\/harvested-path\.js'/u.test(code(file)))
    expect(leaf).toEqual([join(SRC, 'paths.ts')])
  })
})
