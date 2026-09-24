import { describe, expect, it } from 'vitest'
import { FEATURE_1, ITEM_1, PLAN_A } from '../components/plan/testing/plan-fixture'
import { featurePath, itemPath } from './drawer-routes'
import { isLinkSurface, planPath } from './routes'

describe('the two segments a selection is spelled with', () => {
  it('opens a feature at f, one letter under the plan’s own path', () => {
    expect(featurePath(PLAN_A, FEATURE_1)).toBe(`/plans/${PLAN_A}/f/${FEATURE_1}`)
  })

  it('opens an item at i, which is the same shape and a different letter', () => {
    expect(itemPath(PLAN_A, ITEM_1)).toBe(`/plans/${PLAN_A}/i/${ITEM_1}`)
  })

  it('builds both on planPath, so a plan’s own spelling is decided in one place', () => {
    expect(featurePath(PLAN_A, FEATURE_1).startsWith(`${planPath(PLAN_A)}/`)).toBe(true)
    expect(itemPath(PLAN_A, ITEM_1).startsWith(`${planPath(PLAN_A)}/`)).toBe(true)
  })

  it('tells the two apart, so one drawer route can never answer for the other', () => {
    expect(featurePath(PLAN_A, FEATURE_1)).not.toBe(itemPath(PLAN_A, FEATURE_1))
  })

  it('leaves a ULID untouched, since neither a plan id nor a feature id needs encoding', () => {
    expect(featurePath(PLAN_A, FEATURE_1)).not.toContain('%')
    expect(itemPath(PLAN_A, ITEM_1)).not.toContain('%')
  })
})

describe('an id that arrived from somewhere unexpected', () => {
  it.each([
    ['../../etc', `/plans/${PLAN_A}/f/..%2F..%2Fetc`],
    ['a b', `/plans/${PLAN_A}/f/a%20b`],
    ['a?b#c', `/plans/${PLAN_A}/f/a%3Fb%23c`],
  ])('encodes the feature id %s rather than letting it reach the router as structure', (id, expected) => {
    expect(featurePath(PLAN_A, id)).toBe(expected)
  })

  it.each([
    ['../../etc', `/plans/${PLAN_A}/i/..%2F..%2Fetc`],
    ['a?b#c', `/plans/${PLAN_A}/i/a%3Fb%23c`],
  ])('encodes the item id %s the same way', (id, expected) => {
    expect(itemPath(PLAN_A, id)).toBe(expected)
  })

  it('encodes the plan id too, because planPath does and neither builder concatenates', () => {
    expect(featurePath('../plans', FEATURE_1)).toBe(`/plans/..%2Fplans/f/${FEATURE_1}`)
    expect(itemPath('../plans', ITEM_1)).toBe(`/plans/..%2Fplans/i/${ITEM_1}`)
  })
})

describe('neither builder can leave the admin surface', () => {
  it.each([featurePath(PLAN_A, FEATURE_1), itemPath(PLAN_A, ITEM_1)])(
    'builds %s, which the link surface does not claim',
    (path) => {
      expect(isLinkSurface(path)).toBe(false)
    },
  )

  it('exports no builder for the seat twins, which have no page to answer them yet', async () => {
    const drawerRoutes: Record<string, unknown> = await import('./drawer-routes')
    expect(Object.keys(drawerRoutes).sort()).toEqual(['featurePath', 'itemPath'])
  })
})
