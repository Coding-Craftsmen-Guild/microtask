'use client'

import { Button } from '@repo/ui/components/button'
import { EmptyState } from '@repo/ui/shell/empty-state'

/** Props Next hands a segment's error boundary. */
export interface TaskErrorProps {
  /** What was thrown. A Server Component's message is replaced in production, so it is not shown. */
  error: Error & { digest?: string }
  /** Re-fetches and re-renders the segment. */
  retry: () => void
}

/**
 * The task page's error boundary, for a failure the page did not anticipate.
 *
 * Every refusal the API can answer is rendered by the page itself, with the API's own sentence,
 * so what reaches this boundary is a fault rather than an answer — and in production its message
 * is a digest, which is why the text here is fixed and `retry` is the one thing offered.
 */
export default function TaskError({ retry }: TaskErrorProps) {
  return (
    <div className="grid justify-items-center gap-3 pt-5">
      <EmptyState>This task could not be shown.</EmptyState>
      <Button onClick={retry} type="button" variant="outline">
        Try again
      </Button>
    </div>
  )
}
