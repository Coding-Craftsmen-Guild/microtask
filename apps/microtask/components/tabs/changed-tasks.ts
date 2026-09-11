const changed = new Set<string>()

/**
 * Records that this browser changed a task — a save, a tab created, renamed, deleted or moved —
 * since that task's page was rendered.
 *
 * It exists because of one Next behaviour: a page is not cached for ordinary navigation, but it
 * **is** reused on browser Back and Forward, so returning to a task page renders the payload it
 * was first loaded with. The editor would then open on a document older than the one this
 * browser saved, on a stamp older than the one the API holds, and its first keystroke would come
 * back as a 409 — the page reporting its own save as somebody else's, over content missing the
 * edits the user just made. The task page consults this on mount and refreshes when it is set.
 *
 * Module state in the browser, and deliberately nothing more durable: a full reload fetches the
 * page afresh, so there is nothing to remember across one. Only browser code touches it — event
 * handlers mark it and a mount effect reads it — so a server render, which runs neither, never
 * sees it, and one visitor's marks cannot reach another's page.
 */
export function markChanged(taskId: string): void {
  changed.add(taskId)
}

/** Whether {@link markChanged} was called for this task since the last time this was asked. */
export function takeChanged(taskId: string): boolean {
  return changed.delete(taskId)
}
