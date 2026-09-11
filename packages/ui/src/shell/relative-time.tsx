import { relativeTime } from '../lib/time'

/** Props for {@link RelativeTime}. */
export interface RelativeTimeProps {
  /** An ISO timestamp, or a falsy value for "no date", which renders nothing. */
  from: string | null | undefined
  /** The instant to measure against, as epoch milliseconds or a Date. */
  now: number | Date
}

/**
 * Renders a timestamp as a coarse age — `just now`, `Nm ago`, `Nh ago`,
 * `Nd ago`, then a locale date — inside a `time` element that keeps the exact
 * instant in `dateTime`.
 *
 * `now` is a required prop, not `Date.now()` read here, so a Server Component
 * decides the instant once and the markup cannot disagree with itself between
 * server and client. Like legacy, the value is computed at render and never
 * ticks.
 */
export function RelativeTime({ from, now }: RelativeTimeProps) {
  if (!from) return null
  return <time dateTime={from}>{relativeTime(from, now)}</time>
}
