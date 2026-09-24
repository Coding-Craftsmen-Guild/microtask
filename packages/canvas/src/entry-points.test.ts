import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as main from './index.js'

interface Manifest {
  exports: Record<string, { types: string; default: string }>
}

const manifest = async (): Promise<Manifest> =>
  JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Manifest

describe('@repo/canvas entry points', () => {
  it('declares only "." in the exports map, so a deep import cannot become the convention', async () => {
    const { exports } = await manifest()
    expect(Object.keys(exports)).toEqual(['.'])
    expect(exports['.']).toEqual({ types: './dist/index.d.ts', default: './dist/index.js' })
  })

  it('ships the scale, the rails, the marks, the chrome, the rungs, the treatments and the drop, and nothing a later module has not landed yet', () => {
    expect(Object.keys(main).sort()).toEqual([
      'SPRINTS_PER_QUARTER',
      'dayToX',
      'dropTargetFor',
      'itemsToMarks',
      'quarterBands',
      'railAtY',
      'railLayout',
      'rungFor',
      'scaleFor',
      'sprintTicks',
      'todayLine',
      'treatmentOf',
      'treatmentsOf',
      'widthOfDays',
      'xToDay',
    ])
  })

  it('ships all four drag types, a caller having to name the object it passes and the answer it reads', () => {
    const point: main.DragPoint = { x: 0, y: 0 }
    const metrics: main.RailMetrics = { chromeHeight: 40, railHeight: 50 }
    const asked: main.DropQuery = {
      point,
      featureId: 'feature-1',
      rails: [],
      scale: main.scaleFor({ pxPerDay: 8, gutter: 0 }),
      metrics,
    }
    const answer: main.DropTarget | null = main.dropTargetFor(asked)
    expect(answer).toBeNull()
  })

  it('ships the conflict-bearing schedule as a type, which a parsed ScheduleView satisfies whole', () => {
    const wire: main.CanvasScheduleWithConflicts = {
      spans: [{ id: 'f1', startDay: 0, endDay: 2 }],
      cycles: [{ featureIds: ['f2', 'f3'] }],
      unscheduled: [{ id: 'f2', reason: 'in-cycle' }],
      ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }],
    }
    expect(wire.cycles).toHaveLength(1)
  })

  it('leaves it assignable to the narrow schedule, so widening it costs geometry nothing', () => {
    const wire: main.CanvasScheduleWithConflicts = {
      spans: [],
      cycles: [],
      unscheduled: [],
      ignoredEdges: [],
    }
    const geometry: main.CanvasSchedule = wire
    expect(geometry.spans).toEqual([])
  })

  it('keeps the rung bounds off the barrel, since a caller passes a range and reads no threshold', () => {
    expect(Object.keys(main)).not.toContain('ITEM_RUNG_MAX_DAYS')
    expect(Object.keys(main)).not.toContain('FEATURE_RUNG_MAX_DAYS')
  })

  it('keeps the span lookup off the barrel, so two modules share one map instead of exporting it', () => {
    expect(Object.keys(main)).not.toContain('spansById')
  })
})
