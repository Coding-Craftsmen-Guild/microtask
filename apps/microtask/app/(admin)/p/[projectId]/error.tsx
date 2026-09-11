'use client'

import { Button } from '@repo/ui/components/button'

/** Props Next hands a segment's error boundary. */
export interface ProjectErrorProps {
  /** What was thrown. In production a Server Component's message is replaced by a digest. */
  readonly error: Error & { readonly digest?: string }
  /** Re-fetches and re-renders the segment. */
  readonly retry: () => void
}

/**
 * What the project page shows when rendering it threw: a centred muted message, as legacy put in
 * place of its document area, and a way to try again.
 *
 * It does not print `error.message`: in production Next replaces a Server Component's message with
 * a digest, so the only honest sentence here is one that does not pretend to know the cause. A
 * refusal the API explained never reaches this boundary — the page renders its detail itself.
 */
export default function ProjectError({ retry }: ProjectErrorProps) {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center" role="alert">
      <p className="text-muted-foreground">This project could not be shown.</p>
      <Button onClick={retry} type="button" variant="outline">
        Try again
      </Button>
    </div>
  )
}
