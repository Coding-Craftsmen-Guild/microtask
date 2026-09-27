import type { Treatment } from '@repo/canvas'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { atlasPlan, ITEM_1, ITEM_2 } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanCanvas } from './plan-canvas'
import { countedTreatment, withProgress, type Counted } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

const counted = (itemId: string, done: number, total: number): Counted => [
  { itemId, progress: { done, total } },
]

const drawn = (progress: Counted): ReadonlyMap<string, string | null> => {
  const { container } = render(
    <PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} progress={progress} />,
  )
  const marks = [...container.querySelectorAll('[data-slot="item-mark"]')]
  return new Map(marks.map((mark) => [mark.getAttribute('data-item-id') ?? '', mark.getAttribute('data-treatment')]))
}

describe('countedTreatment turns one counted pair into a treatment or into nothing', () => {
  it('answers done at or past the total, and started between nothing and the total', () => {
    expect(countedTreatment({ done: 4, total: 4 })).toBe('done')
    expect(countedTreatment({ done: 1, total: 4 })).toBe('started')
  })

  it('answers nothing for an untouched task and for one that counts nothing at all', () => {
    expect(countedTreatment({ done: 0, total: 4 })).toBeNull()
    expect(countedTreatment({ done: 0, total: 0 })).toBeNull()
  })
})

describe('withProgress overlays what a linked task counts onto the schedule’s own treatments', () => {
  it('leaves a mark the schedule says nothing about solid when nothing is counted', () => {
    expect(withProgress(new Map(), counted(ITEM_1, 0, 3)).get(ITEM_1)).toBeUndefined()
  })

  it('marks a placed item started when its task has begun and done when it has finished', () => {
    expect(withProgress(new Map(), counted(ITEM_1, 1, 3)).get(ITEM_1)).toBe('started')
    expect(withProgress(new Map(), counted(ITEM_1, 3, 3)).get(ITEM_1)).toBe('done')
  })

  // A hollow item was never sized and a contradicted one sits in a cycle. Either is a more urgent sentence
  // than how far along its task is, and a plan that contradicts itself must not hide that behind a tick.
  it('leaves a mark the schedule already has an opinion about exactly as it found it', () => {
    for (const held of ['hollow', 'contradicted'] as const) {
      const schedule: ReadonlyMap<string, Treatment> = new Map([[ITEM_1, held]])
      expect(withProgress(schedule, counted(ITEM_1, 1, 3)).get(ITEM_1)).toBe(held)
      expect(withProgress(schedule, counted(ITEM_1, 3, 3)).get(ITEM_1)).toBe(held)
    }
  })

  it('touches no item the bridge did not count, however many it counted', () => {
    const widened = withProgress(new Map(), counted(ITEM_1, 3, 3))
    expect(widened.get(ITEM_2)).toBeUndefined()
    expect([...widened.keys()]).toEqual([ITEM_1])
  })
})

describe('the canvas draws the three progress levels and stays one element per item', () => {
  it('draws an untouched item solid, a begun one started, and a finished one done', () => {
    expect(drawn(counted(ITEM_1, 0, 4)).get(ITEM_1)).toBe('solid')
    expect(drawn(counted(ITEM_1, 2, 4)).get(ITEM_1)).toBe('started')
    expect(drawn(counted(ITEM_1, 4, 4)).get(ITEM_1)).toBe('done')
  })

  // The constraint the whole shape of this feature is built around: a third *discrete* level costs one more
  // key in two records, where a continuous fill would cost an element or a gradient definition per mark.
  it('adds no element to a started mark, which is why it is a level and not a partial fill', () => {
    const { container } = render(
      <PlanCanvas
        at={AT}
        place={null}
        plan={planScreenModel(atlasPlan())}
        progress={counted(ITEM_1, 2, 4)}
      />,
    )
    const marks = [...container.querySelectorAll('[data-slot="item-mark"]')]
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) expect(mark.children).toHaveLength(0)
    expect(container.querySelectorAll('linearGradient')).toHaveLength(0)
    // The one `<defs>` on this canvas is the arc layer's three arrowheads, which is a constant and not a
    // per-mark cost: it holds markers only, and the same three whether the plan has one mark or 2,000.
    const defs = [...container.querySelectorAll('defs > *')]
    expect(defs.map((node) => node.tagName)).toEqual(['marker', 'marker', 'marker'])
  })

  // Painted so the three differ in lightness as well as in outline, which is what makes them readable in
  // greyscale: `started` is the only one of the three that is partly filled.
  it('paints a started mark at a partial fill and a done one at a full one', () => {
    const { container } = render(
      <PlanCanvas
        at={AT}
        place={null}
        plan={planScreenModel(atlasPlan())}
        progress={[
          { itemId: ITEM_1, progress: { done: 2, total: 4 } },
          { itemId: ITEM_2, progress: { done: 4, total: 4 } },
        ]}
      />,
    )
    const styleOf = (itemId: string): string =>
      container.querySelector(`[data-item-id="${itemId}"]`)?.getAttribute('style') ?? ''
    expect(styleOf(ITEM_1)).toContain('fill-opacity')
    expect(styleOf(ITEM_2)).not.toContain('fill-opacity')
  })
})
