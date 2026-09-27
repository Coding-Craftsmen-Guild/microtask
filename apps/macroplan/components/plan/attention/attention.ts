import type { CanvasScheduleWithConflicts } from '@repo/canvas'
import { ATTENTION_WORDS, unsizedItems } from './attention-words'

/**
 * The kinds of trouble an entity can be in, each one a thing the schedule already reported.
 *
 * `items-unsized` is the only one with no counterpart in `ScheduleResult`. It is a **rollup**: the
 * pass reports every unsized item separately, and a plan whose items are mostly unsized reports
 * dozens of them. Carried up to the feature they belong to, those dozens become one badge per
 * feature, which is the difference between a page with four marks on it and a page with thirty.
 */
export type AttentionKind = 'no-estimate' | 'in-cycle' | 'edge-ignored' | 'items-unsized'

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

/** What {@link attentionOf} reads: names to quote, items to roll up, and the schedule's own report. */
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
  'items-unsized': ATTENTION_WORDS.itemsUnsized,
}

const unscheduled = (plan: AttentionPlan, gathering: Gathering): void => {
  const unsized = new Map<string, number>()
  for (const entry of plan.schedule.unscheduled) {
    const kind = REASONS[entry.reason] ?? 'no-estimate'
    add(gathering, entry.id, { kind, detail: WORD[kind] })
    const feature = gathering.owner.get(entry.id)
    if (feature !== undefined) unsized.set(feature, (unsized.get(feature) ?? 0) + 1)
  }
  for (const [feature, count] of unsized) {
    add(gathering, feature, { kind: 'items-unsized', detail: unsizedItems(count) })
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
 * `unscheduled[].id` is a feature or an item, `cycles[].featureIds` are features, and an
 * `ignoredEdges[]` entry is filed on the feature that was placed in spite of it — the one whose
 * position on the timeline is the thing being explained.
 *
 * An id the plan does not hold still gets an entry. Nothing renders it, because nothing draws a row
 * for an entity it cannot find, and that is the honest outcome: the old panel printed "The schedule
 * names an id this plan does not hold" at a reader who could do nothing with it.
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
 * ### Not how many entities are marked either
 *
 * The map holds items too, and counting them made the header say "19 need attention" over a page
 * showing four marks — every unsized item counted once on its own account and again inside its
 * feature's rollup. A reader cannot reconcile that, and the number they can act on is the number of
 * features: that is what the tree marks, what the tray lists, and what a drawer opens.
 *
 * The items are not lost by being uncounted. Each is marked on its own row in its feature's drawer,
 * which is the one place a person is in a position to size it.
 */
export const attentionCount = (plan: AttentionPlan, found: AttentionMap): number =>
  plan.features.filter((feature) => found.has(feature.id)).length
