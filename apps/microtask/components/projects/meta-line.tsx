import { RelativeTime } from '@repo/ui/shell/relative-time'

/** Props for {@link MetaLine}. */
export interface MetaLineProps {
  /** The counts half, such as `3 tabs · 2 share links`. */
  counts: string
  /** When the thing the row describes last changed. */
  updatedAt: string
  /** The instant the page was rendered, decided once so server and browser agree. */
  now: number
}

/**
 * A row's muted metadata line: `3 tabs · 2 share links · updated 2h ago`.
 *
 * Computed once at render and never ticking, as it was. The age sits in a `time` element so the
 * exact instant is still in the page.
 */
export function MetaLine({ counts, updatedAt, now }: MetaLineProps) {
  return (
    <p className="text-[13px] text-muted-foreground" data-testid="row-meta">
      {counts}
      {' · updated '}
      <RelativeTime from={updatedAt} now={now} />
    </p>
  )
}
