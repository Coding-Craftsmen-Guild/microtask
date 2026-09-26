import { describe, expect, it } from 'vitest'
import { Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanManifest } from '../entities/plan.js'
import { LIMITS } from '../limits.js'
import {
  MemoryPlanStore,
  epic,
  feature,
  fixedClock,
  label,
  marked,
  planManifest,
  sequentialIds,
  STAMP,
} from '../testing/index.js'
import { FeatureService } from './feature-service.js'
import { LabelService } from './label-service.js'
import type { PlanRef } from './refs.js'

const NOW = '2026-09-26T12:00:00.000Z'
const PLAN = marked('PN', 1)
const RAIL = marked('EP', 1)
const OTHER_RAIL = marked('EP', 2)
const ONE = marked('FT', 1)
const TWO = marked('FT', 2)
const PHASE = marked('GP', 1)
const OTHER_PHASE = marked('GP', 2)
const ABSENT = marked('GP', 999)

const at: PlanRef = { product: 'macroplan', planId: PLAN }

const build = () => {
  const store = new MemoryPlanStore()
  const ctx = {
    store,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  }
  return { store, labels: new LabelService(ctx), features: new FeatureService(ctx) }
}

const seed = async (store: MemoryPlanStore, overrides: Partial<PlanManifest> = {}): Promise<void> => {
  await store.saveManifest('macroplan', planManifest(PLAN, overrides))
}

/** Two rails, one feature on each, and one group that neither is in yet. */
const acrossRails = (): Partial<PlanManifest> => ({
  epics: [epic(RAIL, { railOrder: 0 }), epic(OTHER_RAIL, { name: 'Billing', railOrder: 1 })],
  labels: [label(PHASE)],
  features: [
    feature(ONE, RAIL, { name: 'Sign-up flow' }),
    feature(TWO, OTHER_RAIL, { name: 'Invoices' }),
  ],
})

describe('LabelService.add', () => {
  it('adds a label with the colour asked for, and no members', async () => {
    const { store, labels } = build()
    await seed(store)
    const updated = await labels.add(at, { name: '  Phase   One  ', colour: '#112233' })
    expect(updated.labels).toHaveLength(1)
    expect(updated.labels[0]).toMatchObject({
      name: 'Phase One',
      colour: '#112233',
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(updated.features).toEqual([])
  })

  it('falls back to one fixed colour rather than a rotating palette', async () => {
    const { store, labels } = build()
    await seed(store)
    const first = await labels.add(at, { name: 'Phase 1' })
    const second = await labels.add(at, { name: 'Phase 2' })
    expect(second.labels.map((each) => each.colour)).toEqual([
      first.labels[0]?.colour,
      first.labels[0]?.colour,
    ])
  })

  it('refuses one past labelsPerPlan', async () => {
    const { store, labels } = build()
    const many = Array.from({ length: LIMITS.labelsPerPlan }, (_, at) => label(marked('GP', at + 1)))
    await seed(store, { labels: many })
    await expect(labels.add(at, { name: 'One too many' })).rejects.toThrow(Invalid)
  })

  it('raises NotFound for a plan that is not there', async () => {
    const { labels } = build()
    await expect(labels.add(at, { name: 'Phase 1' })).rejects.toThrow(NotFound)
  })
})

describe('LabelService.update', () => {
  it('renames and recolours without touching the features in the group', async () => {
    const { store, labels, features } = build()
    await seed(store, acrossRails())
    await features.setLabel(at, ONE, PHASE)
    const updated = await labels.update(at, PHASE, { name: 'Launch', colour: '#0a0b0c' })
    expect(updated.labels[0]).toMatchObject({ name: 'Launch', colour: '#0a0b0c', updatedAt: NOW })
    expect(updated.features.map((each) => each.labelId)).toEqual([PHASE, null])
  })

  it('leaves the field an absent key names alone', async () => {
    const { store, labels } = build()
    await seed(store, { labels: [label(PHASE, { colour: '#abcdef' })] })
    const updated = await labels.update(at, PHASE, { name: 'Launch' })
    expect(updated.labels[0]?.colour).toBe('#abcdef')
  })

  it('raises NotFound for a label this plan does not hold', async () => {
    const { store, labels } = build()
    await seed(store, { labels: [label(PHASE)] })
    await expect(labels.update(at, ABSENT, { name: 'Launch' })).rejects.toThrow(NotFound)
  })
})

describe('LabelService.remove', () => {
  it('clears the group off every feature, on every rail, and deletes no feature', async () => {
    const { store, labels, features } = build()
    await seed(store, acrossRails())
    await features.setLabel(at, ONE, PHASE)
    await features.setLabel(at, TWO, PHASE)
    const updated = await labels.remove(at, PHASE)
    expect(updated.labels).toEqual([])
    expect(updated.features.map((each) => each.id)).toEqual([ONE, TWO])
    expect(updated.features.map((each) => each.labelId)).toEqual([null, null])
  })

  it('leaves a feature in a different group exactly as it was, stamp included', async () => {
    const { store, labels } = build()
    await seed(store, {
      ...acrossRails(),
      labels: [label(PHASE), label(OTHER_PHASE, { name: 'Phase 2' })],
      features: [
        feature(ONE, RAIL, { labelId: PHASE }),
        feature(TWO, OTHER_RAIL, { labelId: OTHER_PHASE }),
      ],
    })
    const updated = await labels.remove(at, PHASE)
    expect(updated.features[1]).toEqual(feature(TWO, OTHER_RAIL, { labelId: OTHER_PHASE }))
    expect(updated.features[0]).toMatchObject({ labelId: null, updatedAt: NOW })
  })

  it('raises NotFound for a label this plan does not hold', async () => {
    const { store, labels } = build()
    await seed(store, { labels: [label(PHASE)] })
    await expect(labels.remove(at, ABSENT)).rejects.toThrow(NotFound)
  })
})

describe('FeatureService.setLabel', () => {
  it('groups features on two rails under one label, which is what a label is for', async () => {
    const { store, features } = build()
    await seed(store, acrossRails())
    await features.setLabel(at, ONE, PHASE)
    const updated = await features.setLabel(at, TWO, PHASE)
    const grouped = updated.features.filter((each) => each.labelId === PHASE)
    expect(grouped.map((each) => each.epicId)).toEqual([RAIL, OTHER_RAIL])
  })

  it('takes a feature out of a group with null, leaving everything else about it', async () => {
    const { store, features } = build()
    await seed(store, acrossRails())
    const grouped = await features.setLabel(at, ONE, PHASE)
    const released = await features.setLabel(at, ONE, null)
    expect(released.features[0]).toEqual({ ...grouped.features[0], labelId: null })
  })

  it('refuses a label this plan does not hold, which is how a cross-plan group is refused', async () => {
    const { store, features } = build()
    await seed(store, acrossRails())
    await expect(features.setLabel(at, ONE, ABSENT)).rejects.toThrow(Invalid)
  })

  it('raises NotFound for a feature that is not there', async () => {
    const { store, features } = build()
    await seed(store, acrossRails())
    await expect(features.setLabel(at, marked('FT', 9), PHASE)).rejects.toThrow(NotFound)
  })

  it('moves nothing: a group is a way of seeing a plan, not a constraint on it', async () => {
    const { store, features } = build()
    await seed(store, acrossRails())
    const before = await store.readManifest('macroplan', PLAN)
    const after = await features.setLabel(at, ONE, PHASE)
    expect(after.features.map((each) => each.position)).toEqual(
      (before?.features ?? []).map((each) => each.position),
    )
    expect(after.features[0]?.createdAt).toBe(STAMP)
  })
})
