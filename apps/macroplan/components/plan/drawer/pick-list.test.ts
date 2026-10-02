import { describe, expect, it } from 'vitest'
import { atlasPlan, LABEL_1 } from '../testing/plan-fixture'
import { joinPicks, splitPicks } from './pick-list'

describe('the joined choice list, which is the only shape a client boundary admits', () => {
  it('survives a round trip, so what a picker shows is what the server named', () => {
    expect(splitPicks(joinPicks(atlasPlan().labels))).toEqual(
      atlasPlan().labels.map((label) => ({
        colour: label.colour,
        id: label.id,
        name: label.name,
      })),
    )
  })

  it('splits on the first two spaces only, a name being free to hold spaces and the others not', () => {
    expect(splitPicks(`${LABEL_1} #7c3aed Phase one of three`)).toEqual([
      { colour: '#7c3aed', id: LABEL_1, name: 'Phase one of three' },
    ])
  })

  it('answers nothing for an empty string, which is a plan with no groups rather than one blank', () => {
    expect(splitPicks('')).toEqual([])
  })

  // What a list joined by an older build looks like. A row with no swatch is a worse answer than a
  // choice that is missing, so the id stands in for the name and the colour is simply absent.
  it('reads a line with no separators as an id standing in for its own name', () => {
    expect(splitPicks(LABEL_1)).toEqual([{ colour: '', id: LABEL_1, name: LABEL_1 }])
  })

  // The id and the colour hold no whitespace, so stripping theirs is what guarantees the name is
  // everything after the second space — including a stored value nobody expected.
  it('strips whitespace out of the id and the colour, so neither can shift a name', () => {
    const joined = joinPicks([{ colour: '#7c 3aed', id: 'a b', name: 'Phase 1' }])
    expect(joined).toBe('ab #7c3aed Phase 1')
    expect(splitPicks(joined)).toEqual([{ colour: '#7c3aed', id: 'ab', name: 'Phase 1' }])
  })

  it('keeps every choice on its own line, so the list cannot collapse into one', () => {
    expect(joinPicks(atlasPlan().labels).split(String.fromCharCode(10))).toHaveLength(2)
  })
})
