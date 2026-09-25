import type { CanvasScheduleWithConflicts } from '@repo/canvas'
import type { Cycle, IgnoredEdge, Unscheduled, UnscheduledReason } from '@repo/schedule'

/**
 * Which of the three refusals a row is about, and never how bad it is.
 *
 * The three are the three collections `ScheduleView` carries beside `spans`, one section each,
 * because `@repo/contracts`' `IgnoredEdge` is explicit that they are not the same sentence:
 * "Neither a cycle nor an unscheduled entry: the feature named here *did* get a span, one of its
 * stated dependencies was merely set aside to produce it. A canvas that could not tell 'this bar
 * ignores a dependency' from 'this bar could not be placed' would have to guess which sentence to
 * show." A single list sorted by severity would be exactly that guess.
 */
export type ConflictSection = 'cycle' | 'ignored-edge' | 'unscheduled'

/** One feature or item a conflict names, resolved against the plan the schedule came from. */
export interface ConflictSubject {
  /** The feature or item id, which is what a drawer link is built from. */
  readonly id: string

  /** The plan's own name for that id, or the raw id when the plan holds no such record. */
  readonly name: string

  /** Whether the plan held the id at all. */
  readonly known: boolean
}

/**
 * One line of the conflict list: which refusal it is, who it is about, and the words to render.
 *
 * `sentence` is a **string decided here** rather than in the component, for the reason `TableRow`
 * gives for its own columns: the wording is then asserted in a test that needs no DOM, and the
 * `.tsx` that renders a row is only a link and a line of text. `subjects` carries the ids beside
 * those words so the renderer can link each name to the control that fixes it without parsing the
 * sentence back apart.
 *
 * `note` is `null` rather than `''` on a row whose every id resolved, the way `TableRow.item` is
 * `null` on a feature row: the row is then about nothing rather than about something empty, and
 * only one of the two is a fact a test can assert.
 */
export interface ConflictRow {
  /** Unique across every section, so the whole list can be rendered as one keyed set. */
  readonly id: string

  readonly section: ConflictSection

  /** Every feature or item this row names, in the order the sentence names them. */
  readonly subjects: readonly ConflictSubject[]

  readonly sentence: string

  /**
   * Said only when this row names an id the plan does not hold; `null` otherwise.
   *
   * Such a row is answered rather than thrown, and it keeps the `section` the **schedule** put it
   * in. Which refusal the pass made is a fact about the schedule, and it is known whether or not the
   * plan still holds the id — a fourth "unknown" section would throw that fact away, and would take
   * a real cycle out of the cycle list because one of its members could not be named. The
   * `ConflictSubject` falls back to the raw id for the reason `tableRows` falls back to one, an id
   * being the only handle anybody has for chasing the disagreement down; this sentence is what stops
   * the ULID beside it reading as a feature somebody named badly.
   */
  readonly note: string | null
}

/**
 * What {@link conflictRows} reads: names, and a schedule carrying the three refusals.
 *
 * Declared structurally rather than as `Plan`, so **both** shapes this app renders a plan from
 * satisfy it — a whole `Plan` and the `PlanScreenModel` that cannot carry a share token — without
 * either an adapter or a widening of what a page may hold. Nothing here reads an estimate, a
 * position, a rail or a span: a conflict is a statement the forward pass already made, and
 * re-deriving one would be the mistake `EdgeState` names for itself — "that comparison would be a
 * second opinion about a plan the forward pass has already scheduled, and re-deriving a scheduling
 * decision on the client is the mistake `railLayout` names".
 */
export interface ConflictPlan {
  readonly features: readonly NamedRecord[]
  readonly items: readonly NamedRecord[]
  readonly schedule: CanvasScheduleWithConflicts
}

/** The two fields a conflict row needs off a plan's feature or item: who it is, and what to call it. */
export interface NamedRecord {
  readonly id: string
  readonly name: string
}

const UNRESOLVED = 'The schedule names an id this plan does not hold, so the two disagree.'

const CYCLE_TAIL: Readonly<Record<'pair' | 'more', string>> = {
  pair: 'so neither was placed.',
  more: 'so none of them was placed.',
}

const SET_ASIDE = 'was set aside to keep rail order.'

const UNPLACED: Readonly<Record<UnscheduledReason, string>> = {
  'no-estimate': 'has no estimate, so it was left off the timeline.',
  'in-cycle': 'was left off the timeline by a dependency cycle.',
}

const names = (plan: ConflictPlan): ReadonlyMap<string, string> =>
  new Map([...plan.features, ...plan.items].map((record) => [record.id, record.name]))

const subjectOf = (id: string, known: ReadonlyMap<string, string>): ConflictSubject => {
  const name = known.get(id)
  return { id, name: name ?? id, known: name !== undefined }
}

const noteOf = (subjects: readonly ConflictSubject[]): string | null =>
  subjects.every((subject) => subject.known) ? null : UNRESOLVED

const andList = (subjects: readonly ConflictSubject[]): string => {
  const last = subjects.at(-1)
  if (last === undefined) return ''
  const rest = subjects.slice(0, -1)
  return rest.length === 0 ? last.name : `${rest.map((one) => one.name).join(', ')} and ${last.name}`
}

const cycleRow = (cycle: Cycle, known: ReadonlyMap<string, string>): ConflictRow => {
  const subjects = cycle.featureIds.map((id) => subjectOf(id, known))
  const tail = CYCLE_TAIL[subjects.length > 2 ? 'more' : 'pair']
  return {
    id: `cycle:${cycle.featureIds.join(',')}`,
    section: 'cycle',
    subjects,
    sentence: `${andList(subjects)} wait on each other, ${tail}`,
    note: noteOf(subjects),
  }
}

const edgeRow = (edge: IgnoredEdge, known: ReadonlyMap<string, string>): ConflictRow => {
  const feature = subjectOf(edge.featureId, known)
  const dependsOn = subjectOf(edge.dependsOnId, known)
  return {
    id: `edge:${edge.featureId}:${edge.dependsOnId}`,
    section: 'ignored-edge',
    subjects: [feature, dependsOn],
    sentence: `${feature.name} was placed, but its dependency on ${dependsOn.name} ${SET_ASIDE}`,
    note: noteOf([feature, dependsOn]),
  }
}

const unscheduledRow = (entry: Unscheduled, known: ReadonlyMap<string, string>): ConflictRow => {
  const subject = subjectOf(entry.id, known)
  return {
    id: `unscheduled:${entry.id}`,
    section: 'unscheduled',
    subjects: [subject],
    sentence: `${subject.name} ${UNPLACED[entry.reason]}`,
    note: noteOf([subject]),
  }
}

/**
 * Every way this plan contradicts itself, as lines of text with the things they name beside them.
 *
 * ### One row per entry the schedule already made, and none of its own
 *
 * The rows are a rendering of `ScheduleView` and nothing more: one per cycle, one per ignored edge,
 * one per unscheduled entry, in that order. Nothing is re-derived and nothing is repaired, which is
 * spec §6 read as a rule for the surface that *shows* a contradiction: "Nothing in this product ever
 * rewrites a date to resolve a conflict: a solver that silently moves an executive's committed plan
 * is a worse failure than a visible contradiction." §8 records the solver as rejected outright.
 *
 * A plan with no conflicts therefore answers an empty array rather than three empty groups, so a
 * component given nothing renders nothing and never a heading over it.
 *
 * A feature caught in a cycle is named twice on purpose, once in its cycle and once as an
 * unscheduled entry, because the forward pass reports it twice and the two say different things:
 * the cycle says which features are waiting on each other, and the entry says this one has no span.
 * Collapsing them would mean deciding, here, that one of the pass's two statements was redundant.
 *
 * ### The wording, and the distinction it exists to keep
 *
 * `'no-estimate'` and `'in-cycle'` get two different sentences because `UnscheduledReason` is a
 * two-case union and only one of the two is something a user can fix where they are standing — a
 * single "could not be scheduled" would hide which. The in-cycle sentence blames a cycle without
 * claiming the named record is *in* one: `@repo/contracts`' `UnscheduledEntry` says `'in-cycle'`
 * "applies only to a feature caught in a `dependsOn` cycle, which drags every item under it down
 * too", so an item carrying that reason appears in no `cycles` entry anywhere and a sentence
 * pointing at the list above it would be pointing at a line that does not name it.
 *
 * A cycle's sentence is the **indicative** one, and there is a subjunctive one elsewhere:
 * `../drawer/cycle-check.ts` refuses a write that would close a cycle with "These features would wait
 * on each other: …". The tense is the whole difference and it is load-bearing, so neither file can use
 * the other's string. This one is about a cycle the stored plan **holds**, so it carries the
 * consequence the forward pass reported — "so neither was placed" — where a refused write leaves
 * nothing placed or unplaced to report. A reader who finds one of the two should be able to find the
 * other.
 *
 * An ignored edge's sentence says the feature **was placed**, which is the one thing about it that
 * a reader can otherwise get wrong. `@repo/canvas` refuses to give it a treatment for the same
 * reason, in `Treatment`'s own words: "A feature named there is in `spans`, so it is `'solid'`
 * here, and drawing it hollow or dashed would show the wrong sentence — it was placed, and what is
 * wrong with it is a dependency, not its dates."
 *
 * ### Names come from the plan, and one map serves both kinds of id
 *
 * Features and items go into a single lookup rather than two, because `unscheduled` carries feature
 * ids and item ids in one array with nothing to tell them apart — the same absence of a
 * discriminator `spansById` describes in `spans` — so a caller that picked a map per kind would
 * first have to classify an id in order to know which map to ask. Ids are ULIDs and unique across
 * both, so one map cannot answer the wrong record.
 *
 * @param plan - A plan and the schedule derived from it, as the API answered them together.
 * @returns One row per conflict, cycles first, then ignored edges, then unscheduled entries.
 */
export function conflictRows(plan: ConflictPlan): readonly ConflictRow[] {
  const known = names(plan)
  return [
    ...plan.schedule.cycles.map((cycle) => cycleRow(cycle, known)),
    ...plan.schedule.ignoredEdges.map((edge) => edgeRow(edge, known)),
    ...plan.schedule.unscheduled.map((entry) => unscheduledRow(entry, known)),
  ]
}
