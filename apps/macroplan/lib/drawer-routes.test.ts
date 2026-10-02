import { describe, expect, it } from 'vitest'
import { FEATURE_1, ITEM_1, PLAN_A, SEAT_TOKEN } from '../components/plan/testing/plan-fixture'
import {
  ADMIN_DRAWER_ROUTES,
  PLAN_DRAWERS,
  SEAT_DRAWER_ROUTES,
  drawerHref,
  featurePath,
  groupPath,
  itemPath,
  railPath,
} from './drawer-routes'
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

describe('each surface addresses its own drawer, and neither can address the other', () => {
  it.each([featurePath(PLAN_A, FEATURE_1), itemPath(PLAN_A, ITEM_1)])(
    "builds %s, which the link surface does not claim",
    (path) => {
      expect(isLinkSurface(path)).toBe(false)
    },
  )

  // The seat twins, which this module said belonged here "when the pages that answer them exist". They do.
  it.each([
    SEAT_DRAWER_ROUTES.feature(SEAT_TOKEN, FEATURE_1),
    SEAT_DRAWER_ROUTES.item(SEAT_TOKEN, ITEM_1),
  ])(
    "builds %s, which the link surface does claim",
    (path) => {
      expect(isLinkSurface(path)).toBe(true)
    },
  )

  // The two records are what `ConflictList` is handed, and this is the reason it is handed one at all: the
  // same plan and the same subject produce two different paths, and only one of them is reachable by the
  // surface that is rendering. A list importing the admin pair — which it did — drew links a seat holder
  // would follow into a login with no password behind it (ADR 0032).
  it('answers a different path per surface for one and the same subject', () => {
    expect(ADMIN_DRAWER_ROUTES.feature(PLAN_A, FEATURE_1)).toBe(featurePath(PLAN_A, FEATURE_1))
    expect(SEAT_DRAWER_ROUTES.feature(SEAT_TOKEN, FEATURE_1)).not.toBe(
      ADMIN_DRAWER_ROUTES.feature(SEAT_TOKEN, FEATURE_1),
    )
  })

  // The spelling of the two segments is written once each, which is what the module kept them for, so the
  // seat paths differ from the admin ones in their **root** and in nothing else.
  it('uses the same two segments on both surfaces, differing only in the root', () => {
    expect(SEAT_DRAWER_ROUTES.feature(SEAT_TOKEN, FEATURE_1)).toBe(`/s/${SEAT_TOKEN}/f/${FEATURE_1}`)
    expect(SEAT_DRAWER_ROUTES.item(SEAT_TOKEN, ITEM_1)).toBe(`/s/${SEAT_TOKEN}/i/${ITEM_1}`)
    expect(ADMIN_DRAWER_ROUTES.item(PLAN_A, ITEM_1)).toBe(`/plans/${PLAN_A}/i/${ITEM_1}`)
  })

  it('encodes an id that would otherwise escape its segment, on the seat surface as on the admin one', () => {
    expect(SEAT_DRAWER_ROUTES.feature(SEAT_TOKEN, '../elsewhere')).toBe(
      `/s/${SEAT_TOKEN}/f/..%2Felsewhere`,
    )
  })

  it('exports the subject builders, the two surface records and the plan drawers, and nothing else', async () => {
    const drawerRoutes: Record<string, unknown> = await import('./drawer-routes')
    expect(Object.keys(drawerRoutes).sort()).toEqual([
      'ADMIN_DRAWER_ROUTES',
      'PLAN_DRAWERS',
      'SEAT_DRAWER_ROUTES',
      'drawerHref',
      'featurePath',
      'groupPath',
      'itemPath',
      'railPath',
    ])
  })

  // What the panel uses: it is handed `closeHref`, which is the plan's own path on both surfaces, so a
  // link to a sibling drawer needs no route builder and no page has to hand it one.
  it('builds a sibling drawer’s address off whatever root it is given', () => {
    expect(drawerHref(`/plans/${PLAN_A}`, 'item', ITEM_1)).toBe(`/plans/${PLAN_A}/i/${ITEM_1}`)
    expect(drawerHref(`/s/${SEAT_TOKEN}`, 'feature', FEATURE_1)).toBe(
      `/s/${SEAT_TOKEN}/f/${FEATURE_1}`,
    )
  })

  it('encodes the id there too, a root being the only part of it this takes on trust', () => {
    expect(drawerHref(`/plans/${PLAN_A}`, 'feature', '../elsewhere')).toBe(
      `/plans/${PLAN_A}/f/..%2Felsewhere`,
    )
  })

  it('addresses a rail and a group by one letter each, as a feature and an item are', () => {
    expect(railPath(PLAN_A, 'EP1')).toBe(`/plans/${PLAN_A}/r/EP1`)
    expect(groupPath(PLAN_A, 'LB1')).toBe(`/plans/${PLAN_A}/g/LB1`)
  })

  it('encodes an id that would otherwise reach a router as a path segment', () => {
    expect(railPath(PLAN_A, '../../etc')).toBe(`/plans/${PLAN_A}/r/..%2F..%2Fetc`)
    expect(groupPath(PLAN_A, '../../etc')).toBe(`/plans/${PLAN_A}/g/..%2F..%2Fetc`)
  })

  it('builds the two plan-level drawers off the same plan path every other builder uses', () => {
    expect(PLAN_DRAWERS.newRail(PLAN_A)).toBe(`/plans/${PLAN_A}/new/rail?n=0`)
    expect(PLAN_DRAWERS.newGroup(PLAN_A)).toBe(`/plans/${PLAN_A}/new/group`)
  })

  // The count rides on the link because the sidebar that draws it already knows how many rails there
  // are, and the route it opens is deliberately request-free: reading the plan again for one integer
  // would trade that away. `rail-palette.ts` carries why a new rail is proposed a hue at all.
  it('carries the rail count on the new-rail link, so the form can propose a distinguishable hue', () => {
    expect(PLAN_DRAWERS.newRail(PLAN_A, 3)).toBe(`/plans/${PLAN_A}/new/rail?n=3`)
  })

  it('floors a count nobody should have passed, rather than putting it in a URL', () => {
    expect(PLAN_DRAWERS.newRail(PLAN_A, -2)).toBe(`/plans/${PLAN_A}/new/rail?n=0`)
    expect(PLAN_DRAWERS.newRail(PLAN_A, 2.7)).toBe(`/plans/${PLAN_A}/new/rail?n=2`)
  })

  it('offers exactly the two, so a third cannot be added without this list noticing', () => {
    expect(Object.keys(PLAN_DRAWERS).sort()).toEqual(['newGroup', 'newRail'])
  })

  // Settings and sharing were the other two. Neither selects anything, so neither needed an address, and
  // both are menus in the plan head row now (`components/plan/shell/plan-manage.tsx`). This asserts the
  // removal rather than leaving it to the list above, because a path that no longer routes anywhere is
  // exactly the kind of thing a builder keeps answering long after the page behind it is gone.
  it('no longer builds a settings or a share path, both pages having been deleted', () => {
    expect(PLAN_DRAWERS).not.toHaveProperty('settings')
    expect(PLAN_DRAWERS).not.toHaveProperty('share')
  })
})
