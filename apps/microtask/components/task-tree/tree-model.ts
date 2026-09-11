/** A folder as the tree draws it. */
export interface TreeFolder {
  /** Its id. */
  readonly id: string
  /** Its name. */
  readonly name: string
  /** Where it sits among the project's folders. */
  readonly position: number
}

/** A task as the tree places it. */
export interface TreeTask {
  /** Its id. */
  readonly id: string
  /** Its name. */
  readonly name: string
  /** The folder it is filed in, or `null` at the project root. */
  readonly folderId: string | null
  /** Where it sits within its folder group. */
  readonly position: number
}

/** One folder and its tasks, or the project root's tasks when `folder` is `null`. */
export interface TreeGroup<Folder extends TreeFolder, Task extends TreeTask> {
  /** The folder, or `null` for the tasks filed in none. */
  readonly folder: Folder | null
  /** Its tasks, in position order. */
  readonly tasks: readonly Task[]
}

const byPosition = <Item extends { readonly position: number }>(a: Item, b: Item): number =>
  a.position - b.position

/**
 * The project tree: folders in order, each with its tasks in order, then the project root.
 *
 * An empty folder is kept, so it can still be renamed or filled; an empty root is not drawn. A
 * task naming a folder that does not exist is placed at the root rather than lost.
 */
export function groupsOf<Folder extends TreeFolder, Task extends TreeTask>(
  folders: readonly Folder[],
  tasks: readonly Task[],
): TreeGroup<Folder, Task>[] {
  const known = new Set(folders.map((folder) => folder.id))
  const inFolder = (id: string) => tasks.filter((task) => task.folderId === id).sort(byPosition)
  const groups = [...folders]
    .sort(byPosition)
    .map((folder) => ({ folder, tasks: inFolder(folder.id) }))
  const root = tasks.filter((task) => task.folderId === null || !known.has(task.folderId)).sort(byPosition)
  return root.length === 0 ? groups : [...groups, { folder: null, tasks: root }]
}

/**
 * The tree narrowed to what matches `term` — by **name only**, as every search here is (ADR 0021).
 *
 * A matching folder keeps all its tasks; otherwise a folder keeps the tasks that match and is
 * dropped if none do. It is a filter over the manifest the page already holds, so it asks the
 * server nothing and can reveal nothing the page was not already given.
 */
export function filtered<Folder extends TreeFolder, Task extends TreeTask>(
  groups: readonly TreeGroup<Folder, Task>[],
  term: string,
): TreeGroup<Folder, Task>[] {
  const needle = term.trim().toLocaleLowerCase()
  if (needle === '') return [...groups]
  const matches = (name: string) => name.toLocaleLowerCase().includes(needle)
  return groups
    .map((group) =>
      group.folder !== null && matches(group.folder.name)
        ? group
        : { folder: group.folder, tasks: group.tasks.filter((task) => matches(task.name)) },
    )
    .filter((group) => group.tasks.length > 0 || (group.folder !== null && matches(group.folder.name)))
}

/** A folder as a menu offers it: its id, and the words that tell it apart from every other. */
export interface FolderChoice {
  /** Its id, which is what a move sends and what a menu keys its entry by. */
  readonly id: string
  /** Its name, with its place in the tree added when another folder has the same name. */
  readonly label: string
}

/**
 * Every folder in the order the tree draws them, each named so no two read the same.
 *
 * Names are not unique and ids are, so two folders called `ACME` would otherwise be offered as two
 * identical `Move to ACME` entries with nothing to say which is which. A name used more than once
 * carries its place among the folder headings, counted from 1 in position order — `ACME (folder 3)`
 * — and a name used once is left as it is.
 */
export function folderChoices(folders: readonly TreeFolder[]): FolderChoice[] {
  const ordered = [...folders].sort(byPosition)
  const uses = new Map<string, number>()
  for (const folder of ordered) uses.set(folder.name, (uses.get(folder.name) ?? 0) + 1)
  return ordered.map((folder, index) => ({
    id: folder.id,
    label: (uses.get(folder.name) ?? 0) > 1 ? `${folder.name} (folder ${String(index + 1)})` : folder.name,
  }))
}
