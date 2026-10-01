import type { Treatment } from '@repo/canvas'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { atlasPlan, ITEM_1, ITEM_2, ITEM_3, type StoredPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanCanvas } from './plan-canvas'
import { countedTreatment, withProgress, type Counted } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

const counted = (itemId: string, done: number, total: number): Counted => [
  { itemId, progress: { done, total } },
]

// `ITEM_1` begun, `ITEM_2` finished, `ITEM_3` counted by nothing: one render holding all three levels, so a
// test about what tells them apart compares marks drawn by the same canvas rather than three of them.
const EVERY_LEVEL: Counted = [
  { itemId: ITEM_1, progress: { done: 2, total: 4 } },
  { itemId: ITEM_2, progress: { done: 4, total: 4 } },
]

const canvasOf = (progress: Counted, plan: StoredPlan = atlasPlan()): HTMLElement =>
  render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} progress={progress} rung="item" />).container

const markFor = (container: HTMLElement, itemId: string): Element | null =>
  container.querySelector(`[data-item-id="${itemId}"]`)

const classOf = (container: HTMLElement, itemId: string): string =>
  markFor(container, itemId)?.getAttribute('class') ?? ''

const styleOf = (container: HTMLElement, itemId: string): string =>
  markFor(container, itemId)?.getAttribute('style') ?? ''

const drawn = (progress: Counted): ReadonlyMap<string, string | null> => {
  const marks = [...canvasOf(progress).querySelectorAll('[data-slot="item-mark"]')]
  return new Map(marks.map((mark) => [mark.getAttribute('data-item-id') ?? '', mark.getAttribute('data-treatment')]))
}

describe('countedTreatment turns one counted pair into a treatment or into nothing', () => {
  it('answers done at or past the total, and started between nothing and the total', () => {
    expect(countedTreatment({ done: 4, total: 4 })).toBe('done')
    expect(countedTreatment({ done: 5, total: 4 })).toBe('done')
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
  // than how far along its task is, and a plan that contradicts itself must not hide that behind a finished
  // fill — `attentionOf` reads those same two states to mark the entity itself in the sidebar tree.
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
    const container = canvasOf(counted(ITEM_1, 2, 4))
    const marks = [...container.querySelectorAll('[data-slot="item-mark"]')]
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) expect(mark.children).toHaveLength(0)
    expect(container.querySelectorAll('linearGradient')).toHaveLength(0)
    // There is no `<defs>` on this canvas at all. It used to hold the arc layer's three arrowheads —
    // a constant cost, not a per-mark one — and the arrowheads went with `markerEnd`: a dependency's
    // direction is already in the curve, and hue now names the track an arc leaves instead of its kind.
    expect(container.querySelectorAll('defs')).toHaveLength(0)
  })

  // The canvas drew a name per bar once, and draws none now: `rail-features.tsx` carries the whole
  // argument, which is that a name belongs where a reader can read it. The cost that mattered was per
  // *item* and is now zero per mark of either kind, so what is left to assert is the absence itself.
  it('names neither a bar nor an item, every name being in the sidebar, the table or the card', () => {
    const container = canvasOf(EVERY_LEVEL)
    expect(container.querySelectorAll('[data-slot="item-mark"]')).toHaveLength(3)
    expect(container.querySelectorAll('text')).toHaveLength(0)
    expect(container.textContent).not.toContain('Sessions')
  })

  // Painted so the three differ in lightness as well as in outline, which is what makes them readable in
  // greyscale: `started` is the only one of the three whose hue is laid down at part opacity.
  // Every level carries a fill opacity now, because a bar is a wash inside an outline rather than a
  // slab: the fill is what says how far along the work is, so "planned" is a weight of it and not
  // its absence. The levels are still told apart by that weight, which is what this reads.
  it('paints each level at its own weight, planned lightest and done nearly solid', () => {
    const container = canvasOf(EVERY_LEVEL)
    const weight = (id: string): number =>
      Number(/fill-opacity:\s*([0-9.]+)/.exec(styleOf(container, id))?.[1] ?? '1')
    expect(weight(ITEM_3)).toBeLessThan(weight(ITEM_1))
    expect(weight(ITEM_1)).toBeLessThan(weight(ITEM_2))
  })

  // The paint is split in two: the class fixes the treatment and an inline style carries the hue. A mark
  // has no hue to carry only when **both** sources are empty — its feature is in no group and its rail is
  // claimed by no epic, `hueOf` preferring the group and falling back to the rail — and `hueStyle` then
  // answers no style at all. On such a mark the class is the whole drawing, and the three levels still
  // have to differ. They do, in two channels rather than one: `done` sits on its own chart ramp, while
  // `started` keeps `solid`'s fill and is told apart by its outline, the thinner fill being the half in
  // the style.
  it('separates the three levels by class alone on a mark that has no hue to paint with', () => {
    const bare = atlasPlan({ epics: [] })
    const container = canvasOf(EVERY_LEVEL, {
      ...bare,
      features: bare.features.map((one) => ({ ...one, labelId: null })),
    })
    expect(styleOf(container, ITEM_1)).toBe('')
    expect(classOf(container, ITEM_3)).toContain('fill-chart-3')
    expect(classOf(container, ITEM_1)).toContain('fill-chart-3')
    expect(classOf(container, ITEM_2)).toContain('fill-chart-4')
    expect(classOf(container, ITEM_3)).toContain('stroke-chart-3')
    expect(classOf(container, ITEM_1)).toContain('stroke-chart-3')
    expect(new Set([ITEM_1, ITEM_2, ITEM_3].map((id) => classOf(container, id))).size).toBe(3)
  })
})
