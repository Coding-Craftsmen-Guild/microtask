/**
 * What each kind of trouble is called where it is shown, on the entity that has it.
 *
 * These are noun phrases and not sentences. The old conflict panel wrote whole sentences because it
 * was a list standing on its own, far from anything it named — "Re-run migrate-plan on all three
 * tenants has no estimate, so it was left off the timeline" had to say which thing it meant. A badge
 * sitting on the row it describes does not: the subject is already on screen, and repeating it is
 * what made the panel read as thirty restatements of four facts.
 */
export const ATTENTION_WORDS = {
  noEstimate: 'Needs an estimate',
  inCycle: 'In a dependency cycle',
  edgeIgnored: 'Dependency set aside',
} as const

/**
 * Why a thing with no estimate is not on the timeline, for the tray and the drawer callout.
 *
 * The tray has room for a clause where a badge does not, and this is the one fact a badge cannot
 * carry: that the consequence of the missing estimate is absence from the chart the reader is
 * looking at. Without it "Needs an estimate" reads as a nag rather than an explanation.
 */
export const ATTENTION_WHY: Readonly<Record<string, string>> = {
  'no-estimate': 'Give it an estimate and it will take a place on the timeline.',
  'in-cycle': 'These features wait on each other, so none of them could be placed.',
  'edge-ignored': 'It was placed anyway, in rail order, as though the dependency were not there.',
}

/**
 * How many things want looking at, for the sidebar header and the tray heading.
 */
export const needsAttention = (count: number): string =>
  count === 1 ? '1 needs attention' : `${String(count)} need attention`
