import { describe, expect, it } from 'vitest'
import { countsLine, inTreeOrder, plural, progressOf } from './summary'

const task = (id: string, folderId: string | null, position: number, [done, total] = [0, 0]) => ({
  id,
  name: id,
  folderId,
  position,
  progress: { done, total },
})

describe('plural', () => {
  it('spells one and many the way the app being replaced did', () => {
    expect(plural(1, 'tab')).toBe('1 tab')
    expect(plural(0, 'tab')).toBe('0 tabs')
    expect(plural(12, 'share link')).toBe('12 share links')
  })
})

describe('countsLine', () => {
  it('reads "N tabs · N share links" when there are links', () => {
    expect(countsLine(3, 'tab', 2)).toBe('3 tabs · 2 share links')
    expect(countsLine(1, 'task', 1)).toBe('1 task · 1 share link')
  })

  it('omits the share-links clause at zero', () => {
    expect(countsLine(3, 'tab', 0)).toBe('3 tabs')
  })

  it('omits it too when the count was withheld, rather than claiming zero', () => {
    expect(countsLine(3, 'tab', undefined)).toBe('3 tabs')
  })
})

describe('progressOf', () => {
  it('sums the cached progress of every entry', () => {
    const tasks = [task('a', null, 0, [1, 4]), task('b', null, 1, [2, 2]), task('c', null, 2)]
    expect(progressOf(tasks)).toEqual({ done: 3, total: 6 })
  })

  it('is nothing for no entries', () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0 })
  })
})

describe('inTreeOrder', () => {
  it('orders by folder position, then by task position, with the project root last', () => {
    const folders = [
      { id: 'F2', position: 1 },
      { id: 'F1', position: 0 },
    ]
    const tasks = [task('root', null, 0), task('f2-b', 'F2', 1), task('f1', 'F1', 0), task('f2-a', 'F2', 0)]
    expect(inTreeOrder(folders, tasks).map((one) => one.id)).toEqual(['f1', 'f2-a', 'f2-b', 'root'])
  })

  it('keeps a task whose folder is missing, at the root', () => {
    expect(inTreeOrder([], [task('lost', 'GONE', 0)]).map((one) => one.id)).toEqual(['lost'])
  })
})
