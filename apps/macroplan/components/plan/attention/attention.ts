import type { CanvasScheduleWithConflicts } from '@repo/canvas'
import { ATTENTION_WORDS } from './attention-words'

/**
 * The kinds of trouble an entity can be in, each one a thing the schedule already reported.
 *
 * All three are about a **feature**. An item is never in trouble: see {@link attentionOf}.
 */
export type AttentionKind = 'no-estimate' | 'in-cycle' | 'edge-ignored'

/** One thing wrong with one entity: what kind, and what to call it where it is shown. */
export interface Attention {
  readonly kind: AttentionKind

  /** The badge text. A noun phrase, because the entity it sits on is already named. */
  readonly detail: string
}

/**
 * Everything wrong with the plan, keyed by the id of the entity it is wrong with.
 *
 * Feature ids and item ids share the map. They cannot collide — both are minted from one id space —
 * and a caller always knows which it is holding, because it looked the entity up to get there.
 */
export type AttentionMap = ReadonlyMap<string, readonly Attention[]>

/** What {@link attentionOf} reads: names to quote, items to tell apart, and the schedule's report. */
export interface AttentionPlan {
  readonly features: readonly { readonly id: string; readonly name: string }[]
  readonly items: readonly { readonly id: string; readonly featureId: string }[]
  readonly schedule: CanvasScheduleWithConflicts
}

interface Gathering {
  readonly found: Map<string, Attention[]>
  readonly names: ReadonlyMap<string, string>
  readonly owner: ReadonlyMap<string, string>
}

const add = (gathering: Gathering, id: string, attention: Attention): void => {
  const already = gathering.found.get(id)
  if (already === undefined) {
    gathering.found.set(id, [attention])
    return
  }
  if (already.some((each) => each.kind === attention.kind)) return
  already.push(attention)
}

const REASONS: Readonly<Record<string, AttentionKind>> = {
  'no-estimate': 'no-estimate',
  'in-cycle': 'in-cycle',
}

const WORD: Readonly<Record<AttentionKind, string>> = {
  'no-estimate': ATTENTION_WORDS.noEstimate,
  'in-cycle': ATTENTION_WORDS.inCycle,
  'edge-ignored': ATTENTION_WORDS.edgeIgnored,
}

const unscheduled = (plan: AttentionPlan, gathering: Gathering): void => {
  for (const entry of plan.schedule.unscheduled) {
    if (gathering.owner.has(entry.id)) continue
    const kind = REASONS[entry.reason] ?? 'no-estimate'
    add(gathering, entry.id, { kind, detail: WORD[kind] })
  }
}

const cycles = (plan: AttentionPlan, gathering: Gathering): void => {
  for (const cycle of plan.schedule.cycles) {
    for (const id of cycle.featureIds) {
      add(gathering, id, { kind: 'in-cycle', detail: ATTENTION_WORDS.inCycle })
    }
  }
}

const edges = (plan: AttentionPlan, gathering: Gathering): void => {
  for (const edge of plan.schedule.ignoredEdges) {
    const on = gathering.names.get(edge.dependsOnId)
    const detail = on === undefined ? WORD['edge-ignored'] : `Dependency on ${on} set aside`
    add(gathering, edge.featureId, { kind: 'edge-ignored', detail })
  }
}

/**
 * Everything the schedule reported, filed under the entity it is about.
 *
 * ### Why this replaces a list
 *
 * `ScheduleResult` is a report about a *run*: here are the cycles it found, here is what it could
 * not place, here are the edges it dropped. Rendered in that shape it is a wall of prose sitting
 * above the plan, and every row of it has to re-identify its subject by name because the subject is
 * nowhere near. Keyed by entity instead, the same facts become a mark on a row — which is what the
 * product owner asked for, and which is the only rendering that scales past a handful of problems.
 *
 * ### What is not lost
 *
 * Every field of `ScheduleResult` names at least one entity id, so every fact finds a home:
 * `cycles[].featureIds` are features, and an `ignoredEdges[]` entry is filed on the feature that was
 * placed in spite of it — the one whose position on the timeline is the thing being explained.
 *
 * An id the plan does not hold still gets an entry. Nothing renders it, because nothing draws a row
 * for an entity it cannot find, and that is the honest outcome: the old panel printed "The schedule
 * names an id this plan does not hold" at a reader who could do nothing with it.
 *
 * ### An item is never in trouble
 *
 * `unscheduled` holds items as well as features, and every item in it is skipped. An item takes its
 * timing from the feature it is under, so an item nobody sized is not a thing left undone — it is
 * the ordinary case, and a plan is allowed to be broken down only as far as anyone found useful.
 *
 * Both of an item's reasons are already said elsewhere, about the thing they are actually about. An
 * item with no estimate sits under a feature that has one, and nothing is wrong: it simply draws no
 * tick of its own. An item reported `in-cycle` is there because its *feature* is in a cycle, and
 * that feature carries the badge; repeating it on each of its items would multiply one fact by
 * however finely somebody broke the work down.
 *
 * ### Kinds are unique per entity
 *
 * A feature can be reported both in `unscheduled` with reason `in-cycle` and in `cycles`. It gets
 * one `in-cycle` badge, not two.
 */
export function attentionOf(plan: AttentionPlan): AttentionMap {
  const gathering: Gathering = {
    found: new Map(),
    names: new Map(plan.features.map((feature) => [feature.id, feature.name])),
    owner: new Map(plan.items.map((item) => [item.id, item.featureId])),
  }
  unscheduled(plan, gathering)
  cycles(plan, gathering)
  edges(plan, gathering)
  return gathering.found
}

/**
 * How many **features** want looking at.
 *
 * ### Not how many things are wrong
 *
 * A feature that is both unsized and in a cycle is one row a reader has to open, and counting it
 * twice would make the header disagree with the page under it.
 *
 * ### Features, because only a feature can be in trouble
 *
 * {@link attentionOf} files nothing under an item, so counting features is counting the whole map.
 * It is still written as a filter rather than as `found.size`, because the two agreeing is a
 * property of that function and not of this one — and this is the number on screen beside the plan's
 * calendar, which has to match the marks a reader can count.
 */
export const attentionCount = (plan: AttentionPlan, found: AttentionMap): number =>
  plan.features.filter((feature) => found.has(feature.id)).length
