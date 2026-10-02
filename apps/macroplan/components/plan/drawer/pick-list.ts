import type { LabelChoice } from './values'

const ENTRY = ' '

const BETWEEN = String.fromCharCode(10)

const bare = (value: string): string => value.replace(/\s+/gu, '')

/** The value that means "in no group", which is a group id the plan cannot hold. */
export const NO_GROUP = ''

/**
 * A list of choices as **one string**, which is the only shape a client boundary admits.
 *
 * Three fields per line and the name last, because a name is free text and the other two are not: an
 * id and a hex colour hold no whitespace, so the first two spaces are the separators and everything
 * after them is the name, spaces and all. Both are stripped of whitespace on the way in so a stored
 * value nobody expected cannot shift a name into the colour.
 *
 * It exists because `../module-boundaries.test.tsx` admits primitives, unbound functions and `null`
 * across a client boundary and nothing else: a group picker handed `readonly LabelChoice[]` would be
 * handed an array of objects, and the rule that refuses that is the rule that stops a plan — and so a
 * share token — riding into the browser on a prop (ADR 0033). One string per list is the cost of it.
 *
 * Groups and placement targets share this encoding because they are the same three strings: an id a
 * write names, a name a reader picks by, and a hue the swatch is painted in. They are still two types
 * ({@link LabelChoice}, `PlaceTarget`) because one is a set a feature joins and the other a parent it
 * moves under, and a control taking either would be a control that can move a feature into a group.
 *
 * @param choices - The groups, rails or features to offer, in the order they should be offered.
 * @returns One line per choice, or `''` for none at all.
 */
export const joinPicks = (choices: readonly LabelChoice[]): string =>
  choices.map((one) => [bare(one.id), bare(one.colour), one.name].join(ENTRY)).join(BETWEEN)

/**
 * The same list, read back in the browser.
 *
 * A line with no separators at all is read as an id standing in for its own name and no colour, which
 * is what a list joined by an older build would look like: the picker then draws an uncoloured row
 * rather than nothing, since a missing swatch is a worse answer than a missing choice.
 *
 * @param options - Whatever {@link joinPicks} produced.
 * @returns One choice per line, in the order they were joined.
 */
export function splitPicks(options: string): readonly LabelChoice[] {
  if (options === '') return []
  return options.split(BETWEEN).map((line) => {
    const [id = line, colour = '', ...rest] = line.split(ENTRY)
    return { colour, id, name: rest.length === 0 ? line : rest.join(ENTRY) }
  })
}
