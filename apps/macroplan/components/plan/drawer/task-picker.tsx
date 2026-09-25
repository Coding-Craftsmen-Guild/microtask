'use client'

const SELECT = 'h-9 max-w-[28ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

/**
 * One task of the bound project: its id, and the name a reader picks it by.
 *
 * Reconstructed from the one string that crossed the boundary, rather than received as an object.
 */
export interface TaskChoice {
  readonly id: string
  readonly name: string
}

/**
 * The tasks a joined `options` string names, in the order it named them.
 *
 * **One string and not an array of strings**, which is the correction this file exists to record:
 * `module-boundaries.test.tsx` admits across a client boundary only primitives, unbound functions and
 * `null`, and an array of strings is not a primitive — it is refused by shape exactly as an array of
 * objects is. `dependency-toggle.tsx` met this first and its `storedIds` is "a list in disguise", undone
 * by `splitEdges`; this is the same trick with one more field per entry.
 *
 * Entries are separated by a newline and each is `"<id> <name>"`. Both separators are safe because of what
 * the values can be: an `EntityId` is a ULID, so it contains no space, and `cleanName` collapses every run
 * of whitespace to a single space before a name is stored, so a stored name contains no newline. A name
 * that somehow did would produce one junk option rather than a wrong link — the id half would not parse as
 * a ULID and the API would refuse it.
 */
export function splitTasks(options: string): readonly TaskChoice[] {
  if (options === '') return []
  return options.split('\n').map((line) => {
    const at = line.indexOf(' ')
    return at < 0 ? { id: line, name: line } : { id: line.slice(0, at), name: line.slice(at + 1) }
  })
}

/** Props for {@link TaskPicker}. */
export interface TaskPickerProps {
  /** Every task of the bound project, joined — {@link splitTasks} is what undoes it. */
  readonly options: string

  /** The id chosen so far, or `''` for none. */
  readonly chosen: string

  /** Called with the id picked. */
  readonly onChoose: (taskId: string) => void

  /** What to say when the bound project holds no tasks at all. */
  readonly nothing: string
}

/**
 * The tasks of a bound project, as a native `<select>`.
 *
 * Split from `link-field.tsx` when that file met ADR 0027's eighty-line cap, and split here because this
 * is the part with no behaviour — it holds no state, sends nothing, and reports no refusal.
 *
 * {@link splitTasks} above holds the whole argument about why the list arrives as one string.
 *
 * A `<select>` and not a combo box: the list is bounded by `LIMITS.tasksPerProject` at 500, the browser
 * already makes a long select searchable by typing, and this repository has no combo box to reuse that is
 * not part of a command palette.
 */
export function TaskPicker({ options, chosen, onChoose, nothing }: TaskPickerProps) {
  const choices = splitTasks(options)
  if (choices.length === 0) return <p className="text-[13px] text-muted-foreground">{nothing}</p>
  return (
    <select
      aria-label="Task to link this item to"
      className={SELECT}
      onChange={(event) => onChoose(event.target.value)}
      value={chosen}
    >
      <option value="">Choose a task…</option>
      {choices.map((one) => (
        <option key={one.id} value={one.id}>
          {one.name}
        </option>
      ))}
    </select>
  )
}
