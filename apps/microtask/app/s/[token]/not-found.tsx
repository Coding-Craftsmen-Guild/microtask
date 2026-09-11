import { EmptyState } from '@repo/ui/shell/empty-state'

/**
 * A link page's 404: a task this link's project does not hold, an id that is not an id, or the
 * task segment on a task-scoped link, where the route does not exist (ADR 0037).
 *
 * The same words whichever it was, so a task-scoped holder probing ids learns nothing from the
 * answer. A dead link is not this page: it goes to `/s/unavailable`.
 */
export default function LinkNotFound() {
  return (
    <div className="pt-6">
      <EmptyState>Task not found</EmptyState>
    </div>
  )
}
