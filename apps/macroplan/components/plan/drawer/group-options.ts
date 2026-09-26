import type { LabelChoice } from './values'

const ENTRY = ' '

const BETWEEN = String.fromCharCode(10)

/** The one value a `<select>` carries for "in no group", which is not an id. */
export const NO_GROUP = ''

/**
 * Every group of the plan as one string, which is the only shape this list can cross a boundary in.
 *
 * `module-boundaries.test.tsx` admits across a client boundary primitives, unbound functions and `null`
 * and nothing else, and **an array of strings is not a primitive** — it is refused by shape exactly as
 * an array of objects is. So the list is joined here, on the server, and {@link splitGroups} undoes it
 * inside the picker. `task-picker.tsx` carries the long-form version of this argument and
 * `dependency-toggle.tsx`'s `storedIds` was the first of them.
 *
 * Entries are separated by a newline and each is `"<id> <name>"`. Both separators are safe because of
 * what the values are: an `EntityId` is a ULID, so it holds no space, and `cleanName` collapses every run
 * of whitespace to a single space before a name is stored, so a stored name holds no newline.
 */
export const joinGroups = (labels: readonly LabelChoice[]): string =>
  labels.map((label) => `${label.id}${ENTRY}${label.name}`).join(BETWEEN)

/**
 * The groups a joined string names, in the order it named them.
 *
 * Split on the **first** space only, because a group's name may hold spaces and its id may not. An entry
 * with no space at all answers its own id as its name rather than an empty option: a nameless choice is
 * unpickable, where a choice showing a ULID is at least visible as the fault it is.
 */
export function splitGroups(options: string): readonly LabelChoice[] {
  if (options === '') return []
  return options.split(BETWEEN).map((line) => {
    const at = line.indexOf(ENTRY)
    return at < 0 ? { id: line, name: line } : { id: line.slice(0, at), name: line.slice(at + 1) }
  })
}
