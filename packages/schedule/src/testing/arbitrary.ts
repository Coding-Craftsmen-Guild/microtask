import type {
  PlanStructure,
  ScheduleEpic,
  ScheduleFeature,
  ScheduleItem,
} from '../structure.js'

const GOLDEN = 0x9e3779b9
const FALLBACK = 0x6d2b79f5
const MAX_EPICS = 6
const MAX_FEATURES_PER_EPIC = 13
const MAX_ITEMS_PER_FEATURE = 9
const MAX_EDGES = 4
const MAX_POSITION = 20
const MAX_ESTIMATE = 31
const MAX_PIN = 9
const UNESTIMATED_IN = 5
const PINNED_IN = 4
const SPRINT_STEP = 5

type Draw = (bound: number) => number

function xorshift(state: number): number {
  let next = state
  next ^= next << 13
  next ^= next >>> 17
  next ^= next << 5
  return next | 0
}

function indices(count: number): readonly number[] {
  return Array.from({ length: count }, (unused, index) => index)
}

function countOf(draw: Draw, bound: number): readonly number[] {
  return indices(draw(bound))
}

function estimateOf(draw: Draw): number | null {
  return draw(UNESTIMATED_IN) === 0 ? null : draw(MAX_ESTIMATE)
}

function epicsOf(draw: Draw): readonly ScheduleEpic[] {
  return indices(1 + draw(MAX_EPICS)).map((index) => ({
    id: `e${String(index)}`,
    railOrder: draw(MAX_EPICS),
  }))
}

function railOf(draw: Draw, epicId: string, from: number): readonly ScheduleFeature[] {
  return countOf(draw, MAX_FEATURES_PER_EPIC).map((index) => ({
    id: `f${String(from + index)}`,
    epicId,
    position: draw(MAX_POSITION),
    estimateDays: estimateOf(draw),
    pinSprint: draw(PINNED_IN) === 0 ? draw(MAX_PIN) : null,
    dependsOn: [],
  }))
}

function featuresOf(draw: Draw, epics: readonly ScheduleEpic[]): readonly ScheduleFeature[] {
  const features: ScheduleFeature[] = []
  for (const epic of epics) {
    features.push(...railOf(draw, epic.id, features.length))
  }
  return features
}

function withEdges(draw: Draw, features: readonly ScheduleFeature[]): readonly ScheduleFeature[] {
  return features.map((feature) => ({
    ...feature,
    dependsOn: countOf(draw, MAX_EDGES).map(
      () => features[draw(features.length)]?.id ?? feature.id,
    ),
  }))
}

function itemsOf(draw: Draw, features: readonly ScheduleFeature[]): readonly ScheduleItem[] {
  const items: ScheduleItem[] = []
  for (const feature of features) {
    items.push(
      ...countOf(draw, MAX_ITEMS_PER_FEATURE).map((index) => ({
        id: `i${String(items.length + index)}`,
        featureId: feature.id,
        position: draw(MAX_POSITION),
        estimateDays: estimateOf(draw),
      })),
    )
  }
  return items
}

/**
 * A deterministic source of integers in `[0, bound)`, reproducible from its seed.
 *
 * A xorshift32 defined here rather than `Math.random()`, and not because a dependency would be
 * unwelcome: a property test that cannot be replayed is a flake, and a failing seed has to name
 * an input someone can put back in. The seed is mixed through two rounds before the first draw so
 * that neighbouring seeds do not open with correlated sequences, and a zero state — the one state
 * a xorshift can never leave — is replaced before it is ever used.
 *
 * A `bound` of zero or less answers 0, so a draw over an empty collection is total like the rest
 * of this package.
 */
export function randomSource(seed: number): Draw {
  let state = ((seed | 0) ^ GOLDEN) || FALLBACK
  state = xorshift(xorshift(state))
  return (bound: number): number => {
    state = xorshift(state)
    return bound > 0 ? (state >>> 0) % bound : 0
  }
}

/**
 * A deterministic pseudo-random `PlanStructure`, reproducible from its seed.
 *
 * Draws 1–6 epics, 0–12 features per epic, 0–8 items per feature, estimates in `0..30` or `null`,
 * `pinSprint` in `0..8` or `null`, and 0–3 `dependsOn` edges per feature drawn from **all**
 * features — its own rail and itself included. Cycles, self-edges, dangling-looking structures and
 * plans that contradict their own rail order therefore occur on their own, rather than being the
 * special cases a hand-written test happened to remember.
 *
 * Positions and rail orders are drawn too, and repeat, so nothing here lines up with array order:
 * a pass that reads input order instead of deriving its own will disagree with itself under the
 * order-independence property.
 *
 * Ids are minted from running counters, so they are unique within a plan; nothing in this
 * generator produces the duplicate ids `schedule` declines to defend against.
 */
export function arbitraryPlan(seed: number): PlanStructure {
  const draw = randomSource(seed)
  const epics = epicsOf(draw)
  const features = withEdges(draw, featuresOf(draw, epics))
  return {
    startDate: '2026-01-05',
    sprintLengthDays: SPRINT_STEP + draw(2) * SPRINT_STEP,
    timezone: 'Europe/Belgrade',
    epics,
    features,
    items: itemsOf(draw, features),
  }
}
