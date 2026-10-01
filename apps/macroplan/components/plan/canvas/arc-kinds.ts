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
 * ### None of them names a colour any more
 *
 * They used to: `stroke-muted-foreground/40`, `stroke-muted-foreground` and `stroke-destructive`, one
 * hue per kind. So an arc's colour said whether its two ends happened to share a rail — which a reader
 * can already see — and said nothing about *which* work was coupled, which they cannot. On a plan with
 * four rails every arc was the same grey and no thread could be followed.
 *
 * Hue now names the **track an arc leaves**, applied as an inline style by `arc-layer.tsx`, and these
 * classes carry only the weight and the dash. The muted stroke stays as the fallback for an arc out of
 * a rail no epic claims, which is the one case with no hue to take.
 *
 * `ignored` keeps the dash and loses the red. Design §5's rule is that hue cannot carry two meanings,
 * and it is the same rule that made a dropped edge red when hue was unclaimed; with hue assigned to the
 * track, the dash is what is left to say it — the only dashed thing on the canvas — and the table says
 * `set aside to keep rail order` in words for a reader who cannot tell one stroke from another.
 *
 * `same` is quieted with **stroke alpha** rather than element opacity. Choosing a group dims
 * everything outside it by setting `opacity` (`labels/group-css.ts`), so a class setting the same
 * property would be overridden outright instead of compounding — and a faint arc outside the chosen
 * group would come back *brighter* than it is at rest. The two alphas multiply.
 */
export const ARC_CLASS: Readonly<Record<ArcKind, string>> = {
  same: 'fill-none stroke-muted-foreground stroke-1 [stroke-opacity:0.4]',
  cross: 'fill-none stroke-muted-foreground stroke-[1.5]',
  ignored: 'fill-none stroke-muted-foreground stroke-[1.5] [stroke-dasharray:5_3]',
}
