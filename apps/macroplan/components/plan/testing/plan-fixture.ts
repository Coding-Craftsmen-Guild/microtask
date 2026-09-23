import type { Decoded } from '@repo/api-client'
import type { PlanManifest, ScheduleView } from '@repo/contracts'
import type { ListedPlan } from '../../plans/plan-row'

/**
 * The instant every test in this app measures an age against.
 *
 * A constant and never `Date.now()`, for the reason `RelativeTime` takes `now` as a prop: a test
 * that read the clock would assert one sentence today and a different one in an hour, and the
 * failure would arrive months later on a machine nobody changed.
 */
export const NOW = Date.parse('2026-09-23T12:00:00.000Z')

/** What every record in this fixture was last written at: two hours before {@link NOW}. */
export const STAMP = '2026-09-23T10:00:00.000Z'

/** When every record in this fixture was created. */
export const CREATED = '2026-09-01T09:00:00.000Z'

/** `Atlas rollout`: one rail, two features, three items, two seats. */
export const PLAN_A = '01MPAAAAAAAAAAAAAAAAAAAAA1'

/** `Beacon migration`: a plan with nothing in it and nobody on it. */
export const PLAN_B = '01MPBBBBBBBBBBBBBBBBBBBBB2'

/** Atlas's one rail, `Platform`. */
export const EPIC_1 = '01MPEEEEEEEEEEEEEEEEEEEEE1'

/** `Auth rewrite`, the first feature on the rail. */
export const FEATURE_1 = '01MPFFFFFFFFFFFFFFFFFFFFF1'

/** `Billing`, the second, which waits on {@link FEATURE_1}. */
export const FEATURE_2 = '01MPFFFFFFFFFFFFFFFFFFFFF2'

/** `Sessions`, the first item under {@link FEATURE_1}. */
export const ITEM_1 = '01MPHHHHHHHHHHHHHHHHHHHHH1'

/** `Password reset`, the second item under {@link FEATURE_1}. */
export const ITEM_2 = '01MPHHHHHHHHHHHHHHHHHHHHH2'

/** `Invoices`, the one item under {@link FEATURE_2}. */
export const ITEM_3 = '01MPHHHHHHHHHHHHHHHHHHHHH3'

/** The bearer the sealed `mp_admin` cookie carries in these tests. */
export const ADMIN_TOKEN = 'admin.7.sig'

/** The token of Atlas's first seat, which is also a `/s/<token>` segment. */
export const SEAT_TOKEN = 'a_plan_seats_token1'

/** The token of Atlas's second seat, held by nobody these tests render as. */
export const OTHER_SEAT_TOKEN = 'a_second_seats_tok1'

/**
 * A plan as the fake API stores it: the manifest, and the schedule a read derives from it.
 *
 * The manifest and not `PlanView`, because storage holds what an admin may see and the projection
 * decides what a caller is told: `shareLinks` is always here and is **withheld** per principal on
 * the way out (ADR 0013). The schedule rides along because no route answers a plan without one,
 * and because nothing in this app recomputes it — `@repo/schedule` is the API's dependency, so a
 * fixture that derived it here would be asserting a second implementation of the forward pass.
 */
export type StoredPlan = Decoded<typeof PlanManifest> & {
  readonly schedule: Decoded<typeof ScheduleView>
}

const epic = {
  id: EPIC_1,
  name: 'Platform',
  colour: '#3b82f6',
  railOrder: 0,
  binding: null,
  createdAt: CREATED,
  updatedAt: STAMP,
}

const features = [
  {
    id: FEATURE_1,
    epicId: EPIC_1,
    name: 'Auth rewrite',
    position: 0,
    estimateDays: 5,
    pinSprint: null,
    dependsOn: [],
    createdAt: CREATED,
    updatedAt: STAMP,
  },
  {
    id: FEATURE_2,
    epicId: EPIC_1,
    name: 'Billing',
    position: 1,
    estimateDays: 3,
    pinSprint: null,
    dependsOn: [FEATURE_1],
    createdAt: CREATED,
    updatedAt: STAMP,
  },
]

const items = [
  { id: ITEM_1, featureId: FEATURE_1, name: 'Sessions', position: 0, estimateDays: 3 },
  { id: ITEM_2, featureId: FEATURE_1, name: 'Password reset', position: 1, estimateDays: 2 },
  { id: ITEM_3, featureId: FEATURE_2, name: 'Invoices', position: 0, estimateDays: 3 },
].map((one) => ({ ...one, linkedTaskId: null, createdAt: CREATED, updatedAt: STAMP }))

const seats = [
  { token: SEAT_TOKEN, name: 'Dana', role: 'view' as const, createdBy: null, createdAt: CREATED },
  {
    token: OTHER_SEAT_TOKEN,
    name: 'Ravi',
    role: 'manage' as const,
    createdBy: null,
    createdAt: CREATED,
  },
]

const atlasSchedule = {
  spans: [
    { id: FEATURE_1, startDay: 0, endDay: 5 },
    { id: ITEM_1, startDay: 0, endDay: 3 },
    { id: ITEM_2, startDay: 3, endDay: 5 },
    { id: FEATURE_2, startDay: 5, endDay: 8 },
    { id: ITEM_3, startDay: 5, endDay: 8 },
  ],
  cycles: [],
  unscheduled: [],
  ignoredEdges: [],
}

const EMPTY_SCHEDULE = { spans: [], cycles: [], unscheduled: [], ignoredEdges: [] }

/**
 * `Atlas rollout`, the plan with something in it: one rail, two features, three items, two seats.
 *
 * Its schedule is written out rather than computed, and it is coherent with the estimates above —
 * the two features run back to back on the one rail, and each feature's items fill its own span.
 */
export const atlasPlan = (overrides: Partial<StoredPlan> = {}): StoredPlan => ({
  id: PLAN_A,
  name: 'Atlas rollout',
  startDate: '2026-09-28',
  sprintLengthDays: 14,
  timezone: 'Europe/Belgrade',
  epics: [epic],
  features,
  items,
  shareLinks: seats,
  createdAt: CREATED,
  updatedAt: STAMP,
  schedule: atlasSchedule,
  ...overrides,
})

/**
 * `Beacon migration`: a plan with no rails, no work and no seats.
 *
 * It exists so a list is seen to hold more than one row, and so the zero counts a brand-new plan
 * carries are rendered by something rather than assumed.
 */
export const beaconPlan = (overrides: Partial<StoredPlan> = {}): StoredPlan => ({
  id: PLAN_B,
  name: 'Beacon migration',
  startDate: '2026-10-05',
  sprintLengthDays: 7,
  timezone: 'UTC',
  epics: [],
  features: [],
  items: [],
  shareLinks: [],
  createdAt: CREATED,
  updatedAt: '2026-09-22T12:00:00.000Z',
  schedule: EMPTY_SCHEDULE,
  ...overrides,
})

/**
 * One plan as a list row, shaped for a caller that **was** told how many seats it has.
 *
 * `shareLinkCount` is a key rather than a spread here because a row that omits it is the case the
 * list has to render, and `listRow({ shareLinkCount: undefined })` is how a test asks for it: the
 * contract types the field `number | undefined`, so the two spellings are one value and the row
 * may not distinguish them.
 */
export const listRow = (overrides: Partial<ListedPlan> = {}): ListedPlan => ({
  id: PLAN_A,
  name: 'Atlas rollout',
  startDate: '2026-09-28',
  sprintLengthDays: 14,
  timezone: 'Europe/Belgrade',
  epicCount: 1,
  featureCount: 2,
  itemCount: 3,
  shareLinkCount: 2,
  createdAt: CREATED,
  updatedAt: STAMP,
  ...overrides,
})
