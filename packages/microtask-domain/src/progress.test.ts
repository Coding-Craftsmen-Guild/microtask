import { describe, expect, it } from 'vitest'
import { countTasks, MAX_DOCUMENT_DEPTH } from './progress.js'

const task = (checked: boolean) => ({ type: 'taskItem', attrs: { checked } })

const doc = (...content: unknown[]) => ({ type: 'doc' as const, content })

const nest = (depth: number, leaf: unknown): unknown => {
  let node: unknown = leaf
  for (let i = 0; i < depth; i += 1) node = { type: 'bulletList', content: [node] }
  return node
}

describe('countTasks', () => {
  it('counts nothing in an empty document', () => {
    expect(countTasks(doc())).toEqual({ done: 0, total: 0 })
  })

  it('counts checked and unchecked task items', () => {
    expect(countTasks(doc(task(true), task(false), task(true)))).toEqual({ done: 2, total: 3 })
  })

  it('counts task items nested inside other nodes', () => {
    expect(countTasks(doc({ type: 'taskList', content: [task(true), task(false)] })))
      .toEqual({ done: 1, total: 2 })
  })

  it('treats a missing attrs object as unchecked', () => {
    expect(countTasks(doc({ type: 'taskItem' }))).toEqual({ done: 0, total: 1 })
  })

  it('ignores nodes that are not task items', () => {
    expect(countTasks(doc({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] })))
      .toEqual({ done: 0, total: 0 })
  })

  it('survives a document nested far deeper than any real editor produces', () => {
    const deep = doc(nest(MAX_DOCUMENT_DEPTH * 4, task(true)))
    expect(() => countTasks(deep)).not.toThrow()
  })

  it('stops descending past the depth cap rather than throwing', () => {
    const shallow = doc(nest(2, task(true)))
    const beyond = doc(nest(MAX_DOCUMENT_DEPTH + 5, task(true)))
    expect(countTasks(shallow)).toEqual({ done: 1, total: 1 })
    expect(countTasks(beyond)).toEqual({ done: 0, total: 0 })
  })

  it('ignores a non-object where a node is expected', () => {
    expect(countTasks(doc(null, 'text', 42, undefined, task(true)))).toEqual({ done: 1, total: 1 })
  })

  it('ignores a content property that is not an array', () => {
    expect(countTasks({ type: 'doc', content: 'nope' } as never)).toEqual({ done: 0, total: 0 })
  })

  it('counts only a strict true, where the legacy walk counted anything truthy', () => {
    expect(countTasks(doc({ type: 'taskItem', attrs: { checked: 'no' } })))
      .toEqual({ done: 0, total: 1 })
  })
})
