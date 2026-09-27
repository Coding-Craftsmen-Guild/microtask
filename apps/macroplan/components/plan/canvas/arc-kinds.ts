import type { DependencyArc } from '@repo/canvas'

/**
 * The three ways an arc is drawn, which are the three things an arc can mean.
 *
 * Not a {@link Treatment}. A treatment says how one piece of *work* is going — done, started, not
 * started, contradicted — and an arc is not work; it is a relation between two pieces of it. Reusing
 * that record would have meant answering "is this dependency done", which is not a question.
 */
export type ArcKind = 'same' | 'cross' | 'ignored'

/**
 * Which kind an arc is drawn as. An edge the pass dropped wins over where its ends sit.
 *
 * `ignored` first and not last, because a cut edge is the only one of the three that is a *defect*: a
 * cross-rail dependency the schedule honours and a cross-rail dependency it had to drop look alike on
 * the axis and mean opposite things, and the one worth seeing is the one the plan cannot satisfy. So a
 * dropped edge reads as dropped whether or not it also crosses a rail, and `cross` is the answer only
 * for an edge that is genuinely being honoured.
 */
export function arcKindOf(arc: DependencyArc): ArcKind {
  if (arc.ignored) return 'ignored'
  return arc.crossesRails ? 'cross' : 'same'
}

/**
 * The stroke each kind draws with, as whole class strings.
 *
 * Whole strings and never a shared base composed with a variant, which `module-boundaries.test.tsx`
 * refuses anywhere under `components/plan`: Tailwind's scanner reads class names as literal text, so a
 * composed `` `${BASE} stroke-destructive` `` produces a class the build never emits and an arc drawn
 * with no stroke at all.
 *
 * A same-rail arc is the faintest of the three on purpose. Design §3.1 makes rail order already imply
 * most within-rail dependencies, so drawing them at the weight of the cross-rail ones — the arcs that
 * are the only reason two lanes are coupled — would bury the signal in the restatement.
 *
 * `ignored` is `stroke-destructive` and dashed, matching `TREATMENT_CLASS.contradicted` deliberately:
 * that record's own note says red is for "the plan contradicts itself", and a dropped edge is the
 * clearest case of it — two orderings stated that cannot both hold.
 */
export const ARC_CLASS: Readonly<Record<ArcKind, string>> = {
  same: 'fill-none stroke-muted-foreground/40 stroke-1',
  cross: 'fill-none stroke-muted-foreground stroke-[1.5]',
  ignored: 'fill-none stroke-destructive stroke-[1.5] [stroke-dasharray:5_3]',
}

/**
 * The arrowhead each kind ends with, as whole class strings.
 *
 * A `<marker>` per kind rather than one shared marker, because a marker cannot inherit the stroke of
 * the path that references it — `context-stroke` is the attribute that would do it and is not reliably
 * supported — so a single arrowhead would be one colour while three strokes were three, and the red of
 * a dropped edge would arrive at a grey point.
 */
export const ARROW_FILL: Readonly<Record<ArcKind, string>> = {
  same: 'fill-muted-foreground/40 stroke-none',
  cross: 'fill-muted-foreground stroke-none',
  ignored: 'fill-destructive stroke-none',
}

/** The three kinds in drawing order, so a layer maps one list rather than naming each. */
export const ARC_KINDS: readonly ArcKind[] = ['same', 'cross', 'ignored']

/** The id of one kind's arrowhead marker, referenced by every path of that kind. */
export const arrowMarkerId = (kind: ArcKind): string => `mp-arrow-${kind}`
