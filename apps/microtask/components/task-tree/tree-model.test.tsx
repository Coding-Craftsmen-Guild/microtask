import { describe, expect, it } from 'vitest'
import { filtered, folderChoices, groupsOf } from './tree-model'

const folder = (id: string, position: number, name = id) => ({ id, name, position })
const task = (id: string, folderId: string | null, position: number, name = id) => ({
  id,
  name,
  folderId,
  position,
})

const shape = (groups: ReturnType<typeof groupsOf>) =>
  groups.map((group) => [group.folder?.id ?? 'root', group.tasks.map((one) => one.id)])

describe('groupsOf', () => {
  it('draws folders in position order, each with its tasks in position order, then the root', () => {
    const groups = groupsOf(
      [folder('F2', 1), folder('F1', 0)],
      [task('r', null, 0), task('b', 'F1', 1), task('a', 'F1', 0), task('c', 'F2', 0)],
    )
    expect(shape(groups)).toEqual([
      ['F1', ['a', 'b']],
      ['F2', ['c']],
      ['root', ['r']],
    ])
  })

  it('keeps an empty folder, so it can be renamed or filled', () => {
    expect(shape(groupsOf([folder('F1', 0)], []))).toEqual([['F1', []]])
  })

  it('draws no root group when every task is in a folder', () => {
    expect(shape(groupsOf([folder('F1', 0)], [task('a', 'F1', 0)]))).toEqual([['F1', ['a']]])
  })

  it('puts a task naming a missing folder at the root rather than losing it', () => {
    expect(shape(groupsOf([], [task('lost', 'GONE', 0)]))).toEqual([['root', ['lost']]])
  })
})

describe('filtered', () => {
  const groups = groupsOf(
    [folder('F1', 0, 'ACME'), folder('F2', 1, 'Beta Co')],
    [task('a', 'F1', 0, 'Go-live'), task('b', 'F1', 1, 'DNS cutover'), task('c', 'F2', 0, 'Kickoff'), task('r', null, 0, 'Hosting notes')],
  )

  it('keeps everything for an empty or blank term', () => {
    expect(filtered(groups, '')).toEqual(groups)
    expect(filtered(groups, '   ')).toEqual(groups)
  })

  it('matches task names, case-insensitively, keeping the folder they sit in', () => {
    expect(shape(filtered(groups, 'dns'))).toEqual([['F1', ['b']]])
  })

  it('shows a matching folder with every task in it', () => {
    expect(shape(filtered(groups, 'beta'))).toEqual([['F2', ['c']]])
  })

  it('matches tasks at the root', () => {
    expect(shape(filtered(groups, 'HOSTING'))).toEqual([['root', ['r']]])
  })

  it('answers nothing when nothing matches', () => {
    expect(filtered(groups, 'zzz')).toEqual([])
  })

  it('trims the term before matching', () => {
    expect(shape(filtered(groups, '  kick  '))).toEqual([['F2', ['c']]])
  })
})

describe('folderChoices', () => {
  const labels = (folders: Parameters<typeof folderChoices>[0]) => folderChoices(folders).map((one) => one.label)

  it('leaves a name used once as it is, and places a name used twice by its heading', () => {
    expect(labels([folder('F1', 0, 'ACME'), folder('F2', 1, 'Beta Co'), folder('F3', 2, 'ACME')])).toEqual([
      'ACME (folder 1)',
      'Beta Co',
      'ACME (folder 3)',
    ])
  })

  it('never offers two entries that read the same, even beside a folder named like a placed one', () => {
    const tricky = [folder('F1', 0, 'ACME'), folder('F2', 1, 'ACME (folder 3)'), folder('F3', 2, 'ACME')]
    expect(new Set(labels(tricky)).size).toBe(tricky.length)
    expect(folderChoices(tricky).map((one) => one.id)).toEqual(['F1', 'F2', 'F3'])
  })

  it('keeps a plain name plain when nothing else could be read as it', () => {
    expect(labels([folder('F1', 0, 'ACME (folder 3)'), folder('F2', 1, 'Beta Co')])).toEqual(['ACME (folder 3)', 'Beta Co'])
  })
})
