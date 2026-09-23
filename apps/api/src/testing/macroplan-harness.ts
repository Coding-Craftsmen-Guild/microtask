import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Clock } from '@repo/kernel'
import type {
  PlanEpic,
  PlanFeature,
  PlanItem,
  PlanManifest,
  PlanShareLink,
} from '@repo/macroplan-domain'
import {
  STAMP,
  epic,
  feature,
  item,
  itemDocument,
  marked,
  planManifest,
} from '@repo/macroplan-domain/testing'
import { createApp } from '../app.js'
import type { ApiEnv } from '../auth/env.js'
import type { ApiDeps } from '../deps.js'
import { IDS, buildDeps } from './harness.js'

/**
 * Every id the macroplan route fixtures address, marked so a failure names the entity it is about.
 *
 * `missing` is well-formed and belongs to nothing, which is the only way to tell the 404 a real
 * absence produces from the 422 a malformed id produces — two failures a client acts on
 * differently.
 *
 * There is no id here for the plan whose id collides with a project's: that one **is** `IDS.p1`,
 * and giving it a second name would hide the collision the guard suite is built to probe.
 */
export const PLAN_IDS = {
  plan: marked('PN', 1),
  e1: marked('EP', 1),
  e2: marked('EP', 2),
  e3: marked('EP', 3),
  f1: marked('FT', 1),
  f2: marked('FT', 2),
  f3: marked('FT', 3),
  f4: marked('FT', 4),
  f5: marked('FT', 5),
  f6: marked('FT', 6),
  i1: marked('TM', 1),
  i2: marked('TM', 2),
  i3: marked('TM', 3),
  i4: marked('TM', 4),
  i5: marked('TM', 5),
  i6: marked('TM', 6),
  i7: marked('TM', 7),
  i8: marked('TM', 8),
  i9: marked('TM', 9),
  missing: marked('PN', 9),
} as const

/**
 * One seat per role on the fixture plan, plus one on the plan whose id is also a project's.
 *
 * `collidingManage` holds every action the policy grants, at plan scope, on a plan whose id equals
 * `IDS.p1`. It is what proves a Microtask route refuses it: the two products draw their ids from
 * separate sequences, so a collision is possible, and a collision must never be a grant.
 *
 * Deliberately **not** the `PLAN_TOKEN` of `harness.ts`. That one belongs to a plan seeded only by
 * `buildAppWithPlan`, and three suites assert what `warmTokenIndex` counts on that fixture; one
 * token shared between the two fixtures would make either suite's failure readable as the other's.
 */
export const PLAN_TOKENS = {
  view: 'shr_pn_view_seat_token',
  write: 'shr_pn_write_seat_token',
  manage: 'shr_pn_manage_seat_token',
  collidingManage: 'shr_pn_clash_manage_token',
} as const

/** Where every guarded macroplan path hangs. */
export const MACROPLAN_PREFIX = '/v1/macroplan'

/**
 * The timezone of the fixture plan, matching `@repo/schedule`'s own cross-rail example.
 *
 * It changes no span: `schedule()` answers working-day **offsets**, and a timezone only turns an
 * offset into a calendar position. It is copied across anyway so the fixture is the unit test's
 * plan in every field, and nobody comparing the two has to decide which differences may matter.
 */
export const PLAN_TIMEZONE = 'Europe/Belgrade'

const seat = (token: string, role: PlanShareLink['role']): PlanShareLink => ({
  token,
  name: 'A seat',
  role,
  createdBy: null,
  createdAt: STAMP,
})

const fixtureEpics = (): readonly PlanEpic[] => [
  epic(PLAN_IDS.e1, { name: 'Checkout', railOrder: 0 }),
  epic(PLAN_IDS.e2, { name: 'Billing', railOrder: 1, colour: '#ff8833' }),
  epic(PLAN_IDS.e3, { name: 'Search', railOrder: 2, colour: '#22bb77' }),
]

const fixtureFeatures = (): readonly PlanFeature[] => [
  feature(PLAN_IDS.f1, PLAN_IDS.e1, { name: 'Basket', position: 0, estimateDays: 4 }),
  feature(PLAN_IDS.f2, PLAN_IDS.e1, { name: 'Checkout page', position: 1, estimateDays: 3 }),
  feature(PLAN_IDS.f3, PLAN_IDS.e2, {
    name: 'Invoicing',
    position: 0,
    estimateDays: 3,
    dependsOn: [PLAN_IDS.f1],
  }),
  feature(PLAN_IDS.f4, PLAN_IDS.e2, {
    name: 'Dunning',
    position: 1,
    estimateDays: 2,
    dependsOn: [PLAN_IDS.f2],
  }),
  feature(PLAN_IDS.f5, PLAN_IDS.e3, { name: 'Indexing', position: 0, estimateDays: 9 }),
  feature(PLAN_IDS.f6, PLAN_IDS.e3, { name: 'Ranking', position: 1, estimateDays: 5 }),
]

const fixtureItems = (): readonly PlanItem[] => [
  item(PLAN_IDS.i1, PLAN_IDS.f1, { name: 'Add to basket', position: 0, estimateDays: 1 }),
  item(PLAN_IDS.i2, PLAN_IDS.f1, { name: 'Basket totals', position: 1, estimateDays: 3 }),
  item(PLAN_IDS.i3, PLAN_IDS.f3, { name: 'Draft an invoice', position: 0, estimateDays: 1 }),
  item(PLAN_IDS.i4, PLAN_IDS.f3, { name: 'Send an invoice', position: 1, estimateDays: 2 }),
  item(PLAN_IDS.i5, PLAN_IDS.f5, { name: 'Crawl', position: 0, estimateDays: 2 }),
  item(PLAN_IDS.i6, PLAN_IDS.f5, { name: 'Tokenise', position: 1, estimateDays: 3 }),
  item(PLAN_IDS.i7, PLAN_IDS.f5, { name: 'Store', position: 2, estimateDays: 4 }),
  item(PLAN_IDS.i8, PLAN_IDS.f6, { name: 'Score', position: 0, estimateDays: 2 }),
  item(PLAN_IDS.i9, PLAN_IDS.f6, { name: 'Tune', position: 1, estimateDays: 3 }),
]

const fixturePlan = (): PlanManifest =>
  planManifest(PLAN_IDS.plan, {
    name: 'Roadmap',
    startDate: '2026-01-05',
    sprintLengthDays: 10,
    timezone: PLAN_TIMEZONE,
    epics: fixtureEpics(),
    features: fixtureFeatures(),
    items: fixtureItems(),
    shareLinks: [
      seat(PLAN_TOKENS.view, 'view'),
      seat(PLAN_TOKENS.write, 'write'),
      seat(PLAN_TOKENS.manage, 'manage'),
    ],
  })

const collidingPlan = (): PlanManifest =>
  planManifest(IDS.p1, {
    name: 'A plan holding a project id',
    shareLinks: [seat(PLAN_TOKENS.collidingManage, 'manage')],
  })

/** A fresh app beside the deps it was built from, so a test can read what a route wrote. */
export interface MacroplanFixture {
  readonly app: OpenAPIHono<ApiEnv>
  readonly deps: ApiDeps
}

/**
 * A fresh dependency surface holding the fixture plan and the colliding one, on top of `buildDeps`.
 *
 * The fixture plan is `@repo/schedule`'s cross-rail example grown to three rails: `f1` (4d) on
 * Checkout is what `f3` on Billing waits for, so `f3` starts at day 4 although it is first on its
 * own rail, while `f4` waits on `f2` in an order its rail already satisfies and therefore moves
 * nothing. Search runs beside both and is coupled to neither. Every feature that carries items
 * carries items summing to exactly its own estimate, so a span read from this plan is the same
 * whether the pass takes the authored value or the breakdown — which keeps the pinned spans a
 * statement about placement rather than about `effectiveEstimate`.
 *
 * Both plans are written through the same `PlanStore` the routes use and their seats are added to
 * the same token index, so a bearer here resolves exactly as a bearer in production does.
 */
export async function buildMacroplanDeps(at?: Clock): Promise<ApiDeps> {
  const deps = await buildDeps(at)
  const plan = fixturePlan()
  for (const manifest of [plan, collidingPlan()]) {
    await deps.plans.saveManifest('macroplan', manifest)
    deps.tokens.add(
      { product: 'macroplan', containerId: manifest.id },
      manifest.shareLinks.map((one) => one.token),
    )
  }
  for (const one of plan.items) {
    await deps.plans.saveItem('macroplan', plan, itemDocument(one.id))
  }
  return deps
}

/** A fresh app over a fixture plan: three epics, six features with two edges, nine items. */
export async function buildMacroplanApp(at?: Clock): Promise<OpenAPIHono<ApiEnv>> {
  return createApp(await buildMacroplanDeps(at))
}

/** The same app, handed back with its deps for a test that has to read the store directly. */
export async function buildMacroplanFixture(at?: Clock): Promise<MacroplanFixture> {
  const deps = await buildMacroplanDeps(at)
  return { app: createApp(deps), deps }
}
