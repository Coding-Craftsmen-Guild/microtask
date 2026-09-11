import { EmptyState } from '@repo/ui/shell/empty-state'

/**
 * The task page's 404: an id that is not a ULID, or a task or project the API does not hold.
 *
 * Legacy put its failure text in the document area as a centred muted message, and this is that
 * message for the one failure Next routes here rather than to the page.
 */
export default function TaskNotFound() {
  return (
    <div className="pt-5">
      <EmptyState>Task not found</EmptyState>
    </div>
  )
}
