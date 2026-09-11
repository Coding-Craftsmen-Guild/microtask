'use client'

import { Button } from '@repo/ui/components/button'
import { EmptyState } from '@repo/ui/shell/empty-state'

/** Props Next hands a segment's error boundary. */
export interface LinkErrorProps {
  /** What was thrown. A Server Component's message is replaced in production, so it is not shown. */
  error: Error & { digest?: string }
  /** Re-fetches and re-renders the segment. */
  retry: () => void
}

/**
 * A link page's error boundary, for a failure the page did not anticipate.
 *
 * Every refusal the API can answer is rendered by the page with the API's own sentence, and a
 * dead link is redirected to `/s/unavailable`, so what reaches this is a fault — whose message
 * production reduces to a digest. The text is fixed, `retry` is the one thing offered, and
 * nothing here names a token or links to `/login`.
 */
export default function LinkError({ retry }: LinkErrorProps) {
  return (
    <div className="grid justify-items-center gap-3 pt-6">
      <EmptyState>This page could not be shown.</EmptyState>
      <Button onClick={retry} type="button" variant="outline">
        Try again
      </Button>
    </div>
  )
}
