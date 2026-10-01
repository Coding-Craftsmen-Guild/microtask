import type { ScheduleFeature } from '@repo/schedule'
import type { BlockedBy, EdgeState } from './rows'

/** What a feature's edges are answered against: which ids exist, which got spans, which were dropped. */
export interface EdgeSource {
  readonly features: ReadonlyMap<string, string>
  readonly spans: ReadonlyMap<string, unknown>
  readonly setAside: ReadonlySet<string>
}

/** How one dropped edge is keyed, so a set of them can be asked about in one lookup. */
export const edgeKey = (featureId: string, dependsOnId: string): string =>
  `${featureId} ${dependsOnId}`

const edgeState = (featureId: string, dependsOnId: string, source: EdgeSource): EdgeState => {
  if (source.setAside.has(edgeKey(featureId, dependsOnId))) return 'set-aside'
  if (!source.features.has(dependsOnId)) return 'unknown'
  return source.spans.has(dependsOnId) ? 'honoured' : 'unplaced'
}

/**
 * Every dependency a feature states, each with what became of it.
 *
 * {@link EdgeState} carries the whole argument for why there are four answers rather than two, and why
 * `honoured` is membership in `spans` and an absence from `ignoredEdges` and nothing more. This is that
 * rule as code, lifted out of `./rows.ts` when that file reached the 150-line cap its own note predicted
 * it would — the cut is by **concern** and not by row kind, which is what that note asks for: a feature
 * row and an item row still answer the same seven questions in one place.
 */
export const edgesOf = (feature: ScheduleFeature, source: EdgeSource): readonly BlockedBy[] =>
  feature.dependsOn.map((id) => ({
    id,
    name: source.features.get(id) ?? id,
    state: edgeState(feature.id, id, source),
  }))
