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

/** `Atlas rollout`: one rail, two features, three items, three seats. */
export const PLAN_A = '01MPAAAAAAAAAAAAAAAAAAAAA1'

/** `Beacon migration`: a plan with nothing in it and nobody on it. */
export const PLAN_B = '01MPBBBBBBBBBBBBBBBBBBBBB2'

/** A plan id no fixture holds, for the read that must answer 404. */
export const PLAN_GONE = '01MPGGGGGGGGGGGGGGGGGGGGG9'

/** Atlas's one rail, `Platform`. */
export const EPIC_1 = '01MPEEEEEEEEEEEEEEEEEEEEE1'

/** `Auth rewrite`, the first feature on the rail. */
export const FEATURE_1 = '01MPFFFFFFFFFFFFFFFFFFFFF1'

/** `Billing`, the second, which waits on {@link FEATURE_1}. */
export const FEATURE_2 = '01MPFFFFFFFFFFFFFFFFFFFFF2'

/** `Checkout`, which exists only in {@link tangledPlan}, where it is placed out of rail order. */
export const FEATURE_3 = '01MPFFFFFFFFFFFFFFFFFFFFF3'

/** `Reporting`, which exists only in {@link tangledPlan}, where {@link FEATURE_3} waits on it. */
export const FEATURE_4 = '01MPFFFFFFFFFFFFFFFFFFFFF4'

/**
 * A feature id {@link tangledPlan}'s schedule names and its manifest does not hold.
 *
 * The one thing a plan and the schedule derived from it can disagree about, which is a state every
 * surface that renders a conflict has to render rather than throw on.
 */
export const FEATURE_GONE = '01MPFFFFFFFFFFFFFFFFFFFFF9'

/** `Sessions`, the first item under {@link FEATURE_1}. */
export const ITEM_1 = '01MPHHHHHHHHHHHHHHHHHHHHH1'

/** `Password reset`, the second item under {@link FEATURE_1}. */
export const ITEM_2 = '01MPHHHHHHHHHHHHHHHHHHHHH2'

/** `Invoices`, the one item under {@link FEATURE_2}. */
export const ITEM_3 = '01MPHHHHHHHHHHHHHHHHHHHHH3'

/** The bearer the sealed `mp_admin` cookie carries in these tests. */
export const ADMIN_TOKEN = 'admin.7.sig'

/** Atlas's `view` seat, held by `Dana`. Also a valid `/s/<token>` segment. */
export const SEAT_TOKEN = 'a_plan_seats_token1'

/** Atlas's `write` seat, held by `Ivo`. */
export const WRITE_SEAT_TOKEN = 'a_write_seats_token1'

/** Atlas's `manage` seat, held by `Ravi` — the role that *is* told the plan's other seats. */
export const MANAGE_SEAT_TOKEN = 'a_manage_seats_tok1'

/** A token no plan's manifest holds, for the seat that was revoked between resolve and read. */
export const REVOKED_SEAT_TOKEN = 'a_revoked_seats_tok1'

/**
 * A plan as the fake API stores it: the manifest, and the schedule a read derives from it.
 *
 * The manifest and not `PlanView`, because storage holds every seat and the projection decides what
 * a caller is told: `shareLinks` is always here and the block is withheld per **caller** on the way
 * out, from the same `share:read` decision the API asks (ADR 0009, ADR 0013). The schedule rides
 * along because no route answers a plan without one, and because nothing in this app recomputes
 * it — `@repo/schedule` is the API's dependency, so a fixture that derived it here would be
 * asserting a second implementation of the forward pass.
 */
export type StoredPlan = Decoded<typeof PlanManifest> & {
  readonly schedule: Decoded<typeof ScheduleView>
}

const epics = () => [
  {
    id: EPIC_1,
    name: 'Platform',
    colour: '#3b82f6',
    railOrder: 0,
    binding: null,
    createdAt: CREATED,
    updatedAt: STAMP,
  },
]

const features = () => [
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

const items = () =>
  [
    { id: ITEM_1, featureId: FEATURE_1, name: 'Sessions', position: 0, estimateDays: 3 },
    { id: ITEM_2, featureId: FEATURE_1, name: 'Password reset', position: 1, estimateDays: 2 },
    { id: ITEM_3, featureId: FEATURE_2, name: 'Invoices', position: 0, estimateDays: 3 },
  ].map((one) => ({ ...one, linkedTaskId: null, createdAt: CREATED, updatedAt: STAMP }))

const seats = () => [
  { token: SEAT_TOKEN, name: 'Dana', role: 'view' as const, createdBy: null, createdAt: CREATED },
  {
    token: WRITE_SEAT_TOKEN,
    name: 'Ivo',
    role: 'write' as const,
    createdBy: null,
    createdAt: CREATED,
  },
  {
    token: MANAGE_SEAT_TOKEN,
    name: 'Ravi',
    role: 'manage' as const,
    createdBy: null,
    createdAt: CREATED,
  },
]

const atlasSchedule = () => ({
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
})

const emptySchedule = () => ({ spans: [], cycles: [], unscheduled: [], ignoredEdges: [] })

/**
 * `Atlas rollout`, the plan with something in it: one rail, two features, three items, three seats.
 *
 * Every array is built fresh on each call, and that is not tidiness: `PlanManifest` types `epics`,
 * `features`, `items` and `shareLinks` as mutable arrays — only `PlanView` marks them
 * `.readonly()` — so one shared reference would let a `push` or an in-place `sort` in one test
 * rewrite the fixture for every other test in the process, including in other files. The schedule
 * is fresh for the same reason.
 *
 * Its schedule is written out rather than computed, and it is coherent with the estimates above —
 * the two features run back to back on the one rail, and each feature's items fill its own span.
 *
 * The three seats carry the three roles, as `apps/api`'s own plan fixture does, because the role a
 * seat holds is what decides whether it is told the others: `share:read` is `manage` and above.
 */
export const atlasPlan = (overrides: Partial<StoredPlan> = {}): StoredPlan => ({
  id: PLAN_A,
  name: 'Atlas rollout',
  startDate: '2026-09-28',
  sprintLengthDays: 14,
  timezone: 'Europe/Belgrade',
  epics: epics(),
  features: features(),
  items: items(),
  shareLinks: seats(),
  createdAt: CREATED,
  updatedAt: STAMP,
  schedule: atlasSchedule(),
  ...overrides,
})

/**
 * `Atlas rollout` with its second feature left off the axis, and its one item dragged down with it.
 *
 * One fixture rather than one per test file: the canvas draws this state as a gutter stub, the table
 * gives it a row saying why it has no sprint, and the class sweep renders it to reach the hollow and
 * dashed paint — three files asserting three different things about **one** plan, which only holds if
 * it is literally one plan. It was written out three times before this existed, and two of the three
 * copies were byte-identical.
 *
 * `reason` is the forward pass's own `UnscheduledReason`, and the two are not interchangeable:
 * `'no-estimate'` is nothing was sized, `'in-cycle'` is the plan contradicting itself, and
 * `@repo/canvas` draws them hollow and dashed-red respectively. The feature's own `estimateDays` is
 * cleared either way, so the manifest and the schedule agree for the `'no-estimate'` case; a cycle is
 * not also written into `cycles`, because `treatmentOf` reads `unscheduled` alone and says why —
 * "reading `cycles` too would let two derivations of one mark's treatment disagree".
 */
export const unplacedPlan = (reason: 'no-estimate' | 'in-cycle'): StoredPlan => {
  const base = atlasPlan()
  return atlasPlan({
    features: base.features.map((one) =>
      one.id === FEATURE_2 ? { ...one, estimateDays: null } : one,
    ),
    schedule: {
      ...base.schedule,
      spans: base.schedule.spans.filter((one) => one.id !== FEATURE_2 && one.id !== ITEM_3),
      unscheduled: [
        { id: FEATURE_2, reason },
        { id: ITEM_3, reason },
      ],
    },
  })
}

const tangledFeatures = () => {
  const shared = { epicId: EPIC_1, pinSprint: null, createdAt: CREATED, updatedAt: STAMP }
  return [
    { ...shared, id: FEATURE_1, name: 'Auth rewrite', position: 0, estimateDays: 5, dependsOn: [FEATURE_2] },
    { ...shared, id: FEATURE_2, name: 'Billing', position: 1, estimateDays: 3, dependsOn: [FEATURE_1] },
    { ...shared, id: FEATURE_3, name: 'Checkout', position: 2, estimateDays: 5, dependsOn: [FEATURE_4] },
    { ...shared, id: FEATURE_4, name: 'Reporting', position: 3, estimateDays: 4, dependsOn: [] },
  ]
}

const tangledItems = () =>
  [
    { id: ITEM_1, featureId: FEATURE_3, name: 'Sessions', position: 0, estimateDays: 3 },
    { id: ITEM_2, featureId: FEATURE_3, name: 'Password reset', position: 1, estimateDays: 2 },
    { id: ITEM_3, featureId: FEATURE_2, name: 'Invoices', position: 0, estimateDays: 3 },
  ].map((one) => ({ ...one, linkedTaskId: null, createdAt: CREATED, updatedAt: STAMP }))

/**
 * A plan that contradicts itself in all three ways the forward pass can report at once.
 *
 * One fixture rather than one per test file, for the reason {@link unplacedPlan} gives: the conflict
 * list asserts its three sections against this plan, and the class sweep renders the same plan to
 * paint all three section tints. Neither file can drift from the other about what a tangled plan is.
 *
 * It is **coherent**, and that costs it two features {@link atlasPlan} does not have. A cycle's
 * members get no span, so neither of them can be the *placed* feature an `ignoredEdges` entry is
 * about — `@repo/schedule` is explicit that an edge into a cycle member "is ignored and is **not**
 * reported in `ignoredEdges`" — and the three sections therefore need four features between them:
 * `Auth rewrite` and `Billing` wait on each other, and `Checkout` is placed before `Reporting` on the
 * one rail while stating a dependency on it, which is the edge rail order set aside.
 *
 * `Invoices` is the one item here, and it hangs under `Billing` on purpose: the cycle drags it off the
 * axis too, so `unscheduled` names an **item** as well as two features — which is the only way a
 * renderer's choice between a feature drawer and an item drawer is a choice at all. {@link ITEM_1} and
 * {@link ITEM_2} move under `Checkout`, where they are placed and sum to its estimate.
 *
 * {@link FEATURE_GONE} is in `unscheduled` and in no other array, so every row that reads a name from
 * the manifest is rendered beside one that cannot.
 */
export const tangledPlan = (): StoredPlan =>
  atlasPlan({
    features: tangledFeatures(),
    items: tangledItems(),
    schedule: {
      spans: [
        { id: FEATURE_3, startDay: 0, endDay: 5 },
        { id: ITEM_1, startDay: 0, endDay: 3 },
        { id: ITEM_2, startDay: 3, endDay: 5 },
        { id: FEATURE_4, startDay: 5, endDay: 9 },
      ],
      cycles: [{ featureIds: [FEATURE_1, FEATURE_2] }],
      unscheduled: [
        { id: FEATURE_1, reason: 'in-cycle' },
        { id: FEATURE_2, reason: 'in-cycle' },
        { id: ITEM_3, reason: 'in-cycle' },
        { id: FEATURE_GONE, reason: 'no-estimate' },
      ],
      ignoredEdges: [{ featureId: FEATURE_3, dependsOnId: FEATURE_4 }],
    },
  })

/**
 * `Beacon migration`: a plan with no rails, no work and no seats.
 *
 * It exists so a list is seen to hold more than one row, so the zero counts a brand-new plan
 * carries are rendered by something rather than assumed, and so the order the API answers in has
 * two `updatedAt` values to be checked against — this one is a day older than {@link atlasPlan}'s.
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
  schedule: emptySchedule(),
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
  shareLinkCount: 3,
  createdAt: CREATED,
  updatedAt: STAMP,
  ...overrides,
})
