/**
 * The hues a new rail is proposed, in the order they are handed out.
 *
 * ### Why the app picks one and not the domain
 *
 * `@repo/macroplan-domain`'s `epic-service.ts` defaults every rail to one fixed blue, and says why:
 * "a palette would decide what the canvas looks like from inside the domain … A caller that wants a
 * hue sends one." That reasoning is right and this is the caller taking it up. The domain still
 * knows nothing about what a plan looks like; it is this app that draws the bars, so it is this app
 * that has an opinion about telling one rail from another.
 *
 * ### Why it matters
 *
 * Hue is the only thing on the canvas that says which rail a bar belongs to once it is scrolled away
 * from its name. With every rail defaulting to the same blue, a plan of five rails drew five rails
 * of identical bars, and the colour channel — the most legible one a chart has — carried nothing at
 * all.
 *
 * ### The colours
 *
 * Six, spaced around the wheel and held to a similar lightness so no rail shouts louder than
 * another, and dark enough that the 11px white label inside a bar stays readable on every one. They
 * are `#rrggbb` lowercase because `RailColour` refuses anything else.
 *
 * Six rather than one per rail: a plan may hold far more rails than this, and a palette that never
 * repeats would end in colours nobody chose and no two of which can be told apart. Cycling means two
 * distant rails may share a hue, which is a smaller problem than every rail sharing one — and any
 * rail can be recoloured by hand from its own drawer.
 */
export const RAIL_PALETTE: readonly string[] = [
  '#3355ff',
  '#0e9f6e',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
]

/**
 * The colour to propose for the next rail, given how many the plan already holds.
 *
 * A proposal and not a rule: it rides on the create request as `colour`, and the rail's own drawer
 * can change it afterwards. A negative or fractional count answers the first colour rather than
 * throwing, because a count is a length and this is not the place to discover it was not one.
 */
export function nextRailColour(railCount: number): string {
  const size = RAIL_PALETTE.length
  const at = Number.isFinite(railCount) ? Math.max(0, Math.floor(railCount)) % size : 0
  return RAIL_PALETTE[at] ?? RAIL_PALETTE[0] ?? '#3355ff'
}
