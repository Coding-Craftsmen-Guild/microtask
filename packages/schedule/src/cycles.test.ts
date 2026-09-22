import { describe, expect, it } from 'vitest'
import type { ScheduleFeature } from './structure.js'
import { findCycles } from './cycles.js'

const feature = (id: string, ...dependsOn: readonly string[]): ScheduleFeature => ({
  id,
  epicId: 'e1',
  position: 0,
  estimateDays: 1,
  pinSprint: null,
  dependsOn,
})

const ids = (features: readonly ScheduleFeature[]): readonly (readonly string[])[] =>
  findCycles(features).map((cycle) => cycle.featureIds)

const deepFrozen = (features: readonly ScheduleFeature[]): readonly ScheduleFeature[] =>
  Object.freeze(
    features.map((one) => Object.freeze({ ...one, dependsOn: Object.freeze([...one.dependsOn]) })),
  )

describe('findCycles reports every dependsOn cycle among features', () => {
  it('answers an empty list for a graph with no edges at all', () => {
    expect(ids([feature('a'), feature('b'), feature('c')])).toEqual([])
  })

  it('answers an empty list for a chain that never comes back', () => {
    expect(ids([feature('a', 'b'), feature('b', 'c'), feature('c')])).toEqual([])
  })

  it('reports a two-feature cycle once, as ascending ids', () => {
    expect(ids([feature('a', 'b'), feature('b', 'a')])).toEqual([['a', 'b']])
  })

  it('reports a self-edge as a cycle of one', () => {
    expect(ids([feature('a', 'a'), feature('b')])).toEqual([['a']])
  })

  it('sorts the ids of a three-feature cycle ascending, whatever order the edges run in', () => {
    expect(ids([feature('c', 'b'), feature('b', 'a'), feature('a', 'c')])).toEqual([
      ['a', 'b', 'c'],
    ])
  })

  it('reports two disjoint cycles as two entries, ordered by their first id', () => {
    const graph = [
      feature('x', 'y'),
      feature('y', 'x'),
      feature('a', 'b'),
      feature('b', 'a'),
      feature('m'),
    ]
    expect(ids(graph)).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ])
  })

  it('does not call a diamond a cycle: a→b, a→c, b→d, c→d all point one way', () => {
    const diamond = [feature('a', 'b', 'c'), feature('b', 'd'), feature('c', 'd'), feature('d')]
    expect(ids(diamond)).toEqual([])
  })

  it('leaves out a feature that merely depends into a cycle without being in it', () => {
    const graph = [feature('a', 'b'), feature('b', 'c'), feature('c', 'b'), feature('d', 'a')]
    expect(ids(graph)).toEqual([['b', 'c']])
  })

  it('folds a self-edge inside a larger cycle into that one cycle, not two', () => {
    expect(ids([feature('a', 'a', 'b'), feature('b', 'a')])).toEqual([['a', 'b']])
  })

  it('ignores an edge naming a feature id that does not exist, and throws nothing', () => {
    expect(() => findCycles([feature('a', 'ghost')])).not.toThrow()
    expect(ids([feature('a', 'ghost'), feature('b', 'also-gone')])).toEqual([])
  })

  it('still sees a real cycle alongside a dangling edge', () => {
    expect(ids([feature('a', 'b', 'ghost'), feature('b', 'a')])).toEqual([['a', 'b']])
  })

  it('answers the same for a shuffled input as for the original order', () => {
    const graph = [
      feature('x', 'y'),
      feature('y', 'x'),
      feature('a', 'b'),
      feature('b', 'c'),
      feature('c', 'a'),
      feature('m', 'x'),
      feature('n'),
    ]
    const order = [3, 6, 0, 5, 1, 4, 2]
    const shuffled = order.map((at) => {
      const one = graph[at]
      if (one === undefined) throw new RangeError(`no feature at ${String(at)}`)
      return one
    })
    const reversed = [...graph].reverse().map((one) => one.id)
    expect(shuffled.map((one) => one.id)).not.toEqual(graph.map((one) => one.id))
    expect(shuffled.map((one) => one.id)).not.toEqual(reversed)
    expect(ids(shuffled)).toEqual([
      ['a', 'b', 'c'],
      ['x', 'y'],
    ])
    expect(ids(shuffled)).toEqual(ids(graph))
  })

  it('never mutates the array it is given, nor any feature in it', () => {
    const graph = deepFrozen([feature('x', 'y'), feature('y', 'x'), feature('a', 'a')])
    const before = JSON.stringify(graph)
    expect(() => findCycles(graph)).not.toThrow()
    expect(ids(graph)).toEqual([['a'], ['x', 'y']])
    expect(JSON.stringify(graph)).toBe(before)
    expect(graph.map((one) => one.id)).toEqual(['x', 'y', 'a'])
  })

  it('walks one 200-feature cycle to the end without overflowing the stack', () => {
    /**
     * The 1s wall-clock ceiling that stood here is gone with the word "linear" it was offered as
     * proof of: a clock cannot tell linear from quadratic at one input size, and vitest's own
     * timeout already fails a walk that does not return. `findCycles`'s TSDoc argues the asymptotics
     * from Tarjan, which is where an asymptotic claim can actually be checked.
     */
    const size = 200
    const chain = Array.from({ length: size }, (_unused, at) =>
      feature(String(at).padStart(3, '0'), String((at + 1) % size).padStart(3, '0')),
    )
    const found = findCycles(chain)
    expect(found).toHaveLength(1)
    expect(found[0]?.featureIds).toHaveLength(size)
  })
})
