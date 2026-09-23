'use client'

import { Button } from '@repo/ui/components/button'

/** Props Next hands a segment's error boundary. */
export interface LinkErrorProps {
  /** What was thrown. A Server Component's message is replaced by a digest in production, so it is not shown. */
  readonly error: Error & { digest?: string }

  /** Re-fetches the segment on the server and then clears this boundary. */
  readonly retry: () => void
}

/**
 * A seat page's error boundary, for a failure the page did not anticipate.
 *
 * It catches almost nothing the API can produce, and that is by design rather than by luck. Every
 * refusal is a value the page renders as a sentence, a dead link is a redirect to `/s/unavailable`,
 * and a plan the API does not hold is `not-found.tsx` — so what reaches this is a *fault*, whose
 * message production reduces to a digest. The text is therefore fixed, and it names no token, no
 * plan and no status; nothing here links to `/login`, which is the answer a seat holder must never be
 * given (ADR 0032).
 *
 * Next 16.3.4 hands an error boundary `{ error, reset, retry }` and both of the last two are real:
 * `reset` only clears this boundary's state, so a Server Component that threw would re-render from
 * the payload that already failed, while `retry` refreshes the router first and then clears it. A
 * fault on this surface is a server-side one, so `retry` is the only one of the two worth offering,
 * which is what `apps/microtask`'s boundary offers too.
 */
export default function LinkError({ retry }: LinkErrorProps) {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground" role="alert">
        This page could not be shown.
      </p>
      <Button onClick={retry} type="button" variant="outline">
        Try again
      </Button>
    </div>
  )
}
