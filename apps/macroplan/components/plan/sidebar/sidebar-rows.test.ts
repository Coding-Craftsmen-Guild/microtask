import { railsOf } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { detailsOf } from '../canvas/detail-lines'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  beaconPlan,
  EPIC_1,
  EPIC_2,
  EPIC_3,
  EPIC_UNCLAIMED,
  FEATURE_1,
  FEATURE_2,
  FEATURE_5,
  railedPlan,
} from '../testing/plan-fixture'
import { sidebarRails, UNNAMED } from './sidebar-rows'

const RAILED = planScreenModel(railedPlan())

const ATLAS = planScreenModel(atlasPlan())

describe('sidebarRails turns a plan into the tree the sidebar lists', () => {
  it('lists every rail the plan declares, in rail order', () => {
    expect(sidebarRails(RAILED).map((rail) => rail.id)).toEqual([
      EPIC_1,
      EPIC_2,
      EPIC_3,
      EPIC_UNCLAIMED,
    ])
  })

  it('takes feature order from railsOf, so the tree cannot disagree with the canvas', () => {
    const derived = railsOf(railedPlan())
    for (const rail of sidebarRails(RAILED)) {
      const mine = rail.features.map((feature) => feature.id)
      const theirs = derived.find((one) => one[0]?.epicId === rail.id)?.map((one) => one.id) ?? []
      expect(mine).toEqual(theirs)
    }
  })

  it('keeps a rail no epic claims, ordered after every real one, since the canvas draws it', () => {
    const last = sidebarRails(RAILED).at(-1)
    expect(last?.id).toBe(EPIC_UNCLAIMED)
    expect(last?.features.map((one) => one.id)).toEqual([FEATURE_5])
  })

  it('gives that rail no name and no colour of its own, rather than inventing either', () => {
    const last = sidebarRails(RAILED).at(-1)
    expect(last?.name).toBe(UNNAMED)
    expect(last?.colour).toBe('')
  })

  // A rail with nothing on it is the one somebody most needs to find, because putting the first feature on
  // it is the next thing to do — and `railsOf` groups features, so it is absent from that answer.
  it('lists a rail with no features at all, which railsOf alone would have dropped', () => {
    const empty = planScreenModel({ ...atlasPlan(), features: [], items: [] })
    expect(sidebarRails(empty).map((rail) => rail.id)).toEqual([EPIC_1])
    expect(sidebarRails(empty)[0]?.features).toEqual([])
  })

  it('names each feature from the manifest, beside the rail it sits on', () => {
    const rail = sidebarRails(ATLAS)[0]
    expect(rail?.name).toBe('Platform')
    expect(rail?.features.map((one) => one.name)).toEqual(['Auth rewrite', 'Billing'])
    expect(rail?.features.map((one) => one.id)).toEqual([FEATURE_1, FEATURE_2])
  })

  it('carries the rail hue through untouched, since a swatch paints it as an inline style', () => {
    expect(sidebarRails(ATLAS)[0]?.colour).toBe('#3b82f6')
  })

  it('answers nothing for a plan with no rails, which is what a new plan is', () => {
    expect(sidebarRails(planScreenModel(beaconPlan()))).toEqual([])
  })

  it('lists a feature the forward pass could not place, a stub still being reachable', () => {
    const ids = sidebarRails(RAILED).flatMap((rail) => rail.features.map((one) => one.id))
    expect(railedPlan().schedule.unscheduled.map((one) => one.id)).toContain(FEATURE_2)
    expect(ids).toContain(FEATURE_2)
  })

  it('mutates the plan it was handed not at all', () => {
    const plan = planScreenModel(railedPlan())
    const before = JSON.stringify(plan)
    sidebarRails(plan)
    expect(JSON.stringify(plan)).toBe(before)
  })
})

describe('the hover card each feature row carries', () => {
  it('carries the same joined detail the bar on the canvas carries, so one hover has one answer', () => {
    const details = detailsOf(ATLAS)
    const features = sidebarRails(ATLAS).flatMap((rail) => rail.features)
    expect(features.length).toBeGreaterThan(0)
    for (const feature of features) {
      expect(feature.detail, feature.name).toBe(details.get(feature.id))
    }
  })

  it('leaves a rail without one, there being nothing a card would add to the band’s own name', () => {
    const rails = sidebarRails(ATLAS)
    expect(rails.length).toBeGreaterThan(0)
    for (const rail of rails) expect(Object.hasOwn(rail, 'detail')).toBe(false)
  })
})
