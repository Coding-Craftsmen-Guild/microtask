const MINUTE_MS = 60_000

/**
 * Formats `from` as a coarse age relative to `now`, in legacy's exact wording:
 * `just now`, `Nm ago`, `Nh ago`, `Nd ago`, then the locale date.
 *
 * Every step rounds to nearest rather than truncating, which is what legacy did
 * and what moves each boundary to the half unit: 30s reads `1m ago`, 59.5min
 * reads `1h ago`, 23.5h reads `1d ago` and 29.5d reads as a date. A future
 * timestamp rounds to a non-positive minute count and so reads `just now`.
 *
 * `now` is a parameter and never `Date.now()`, so a caller renders the same
 * string on the server and in the browser and a test can pin every boundary.
 *
 * @param from - An ISO timestamp, or a falsy value for "no date", which yields ''.
 * @param now - The instant to measure against, as epoch milliseconds or a Date.
 * @returns The rendered age, or '' when `from` is falsy.
 */
export function relativeTime(from: string | null | undefined, now: number | Date): string {
  if (!from) return ''
  const at = new Date(from)
  const minutes = Math.round((Number(now) - at.getTime()) / MINUTE_MS)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${String(days)}d ago`
  return at.toLocaleDateString()
}
