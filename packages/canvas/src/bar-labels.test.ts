import { describe, expect, it } from 'vitest'
import { barLabels } from './bar-labels.js'
import type { LabelMetrics } from './bar-labels.js'
import type { FeatureBar } from './rails.js'

const METRICS: LabelMetrics = { charWidth: 6, inset: 4, minInside: 6, overhang: 180 }

const bar = (id: string, x: number, width: number): FeatureBar => ({
  id,
  startDay: 0,
  endDay: 0,
  x,
  width,
})

const only = (bars: readonly FeatureBar[]) => {
  const [first] = barLabels(bars, METRICS)
  if (first === undefined) throw new Error('barLabels returned nothing for a non-empty rail')
  return first
}

describe('barLabels puts a wide bar its name on top of itself', () => {
  it('calls it inside once the bar fits the shortest label worth drawing there', () => {
    expect(only([bar('f1', 100, 100)])).toEqual({ id: 'f1', x: 104, inside: true, maxChars: 15 })
  })

  it('starts the text one inset in, so it does not sit on the bar edge', () => {
    expect(only([bar('f1', 250, 90)]).x).toBe(254)
  })

  it('budgets for both insets, since the text has an edge at each end', () => {
    expect(only([bar('f1', 0, 64)]).maxChars).toBe((64 - 8) / METRICS.charWidth | 0)
  })

  it('takes the bar exactly at the threshold, which is the boundary a reader would ask about', () => {
    const atThreshold = METRICS.minInside * METRICS.charWidth + METRICS.inset * 2
    expect(only([bar('f1', 0, atThreshold)]).inside).toBe(true)
    expect(only([bar('f1', 0, atThreshold - 1)]).inside).toBe(false)
  })
})

describe('barLabels puts a narrow bar its name after itself', () => {
  it('starts the text past the bar end, not past its start', () => {
    expect(only([bar('f1', 100, 10)])).toEqual({ id: 'f1', x: 114, inside: false, maxChars: 28 })
  })

  it('gives a milestone, which has no width at all, an outside label', () => {
    expect(only([bar('f1', 300, 0)]).inside).toBe(false)
  })

  it('runs a last label out to the overhang, so a lone bar still reads', () => {
    const label = only([bar('f1', 0, 10)])
    expect(label.maxChars).toBe((METRICS.overhang - METRICS.inset * 2) / METRICS.charWidth | 0)
  })
})

describe('barLabels stops an outside label at the next bar on the rail', () => {
  it('budgets the gap and not the overhang when a neighbour follows', () => {
    const labels = barLabels([bar('f1', 0, 10), bar('f2', 70, 10)], METRICS)
    expect(labels[0]).toEqual({ id: 'f1', x: 14, inside: false, maxChars: 8 })
  })

  it('answers zero characters when the neighbour leaves no room, rather than a negative budget', () => {
    const labels = barLabels([bar('f1', 0, 10), bar('f2', 12, 10)], METRICS)
    expect(labels[0]?.maxChars).toBe(0)
  })

  // The ordinary case, and the one an earlier version got wrong: features on a rail are scheduled
  // back to back, so the next bar starts exactly where this one ends. Falling back to the overhang
  // there drew every name in a contiguous run on top of the others at one x.
  it('budgets nothing for a bar whose neighbour starts exactly where it ends', () => {
    const labels = barLabels([bar('f1', 0, 40), bar('f2', 40, 40)], METRICS)
    expect(labels[0]?.maxChars).toBe(0)
  })

  it('budgets nothing for two marks at one point, rather than two names at one x', () => {
    const labels = barLabels([bar('f1', 40, 0), bar('f2', 40, 0)], METRICS)
    expect(labels[0]?.maxChars).toBe(0)
  })

  it('still gives the last bar on the rail its overhang, there being nothing to run into', () => {
    const labels = barLabels([bar('f1', 0, 40), bar('f2', 40, 10)], METRICS)
    expect(labels[1]?.maxChars).toBeGreaterThan(20)
  })
})

describe('barLabels answers for every bar it was given', () => {
  it('returns one label per bar, in the order it was handed them', () => {
    const bars = [bar('f1', 0, 200), bar('f2', 210, 4), bar('f3', 400, 120)]
    expect(barLabels(bars, METRICS).map((label) => label.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('returns nothing for a rail with no bars, which is a rail with nothing placed on it', () => {
    expect(barLabels([], METRICS)).toEqual([])
  })

  it('mutates neither the bars nor the metrics it was handed', () => {
    const bars = [bar('f1', 0, 200), bar('f2', 210, 4)]
    const copy = structuredClone(bars)
    const metrics = { ...METRICS }
    barLabels(bars, metrics)
    expect(bars).toEqual(copy)
    expect(metrics).toEqual(METRICS)
  })
})
