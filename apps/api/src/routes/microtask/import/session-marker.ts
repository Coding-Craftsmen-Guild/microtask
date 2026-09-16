/**
 * What one import session's marker file records, and the whole of its durable state.
 *
 * `openedAt` is the instant the TTL sweep measures against, `bytes` the running total the session
 * cap is measured against, and `paths` every distinct path the session has staged — which is what
 * lets a path that cannot be staged beside another be refused in memory rather than by the
 * filesystem (ADR 0045, and `session-paths.ts` for why that matters).
 *
 * All three live on the volume rather than in this process because a chunked upload straddles
 * requests: a restart between two chunks must not lose the accounting, and must not lose the
 * record of what is already under `files/` either.
 */
export interface SessionMarker {
  readonly openedAt: string
  readonly bytes: number
  readonly paths: readonly string[]
}

const isPaths = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((one) => typeof one === 'string')

const isMarker = (value: unknown): value is SessionMarker => {
  if (typeof value !== 'object' || value === null) return false
  const { openedAt, bytes, paths } = value as Partial<SessionMarker>
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return false
  if (!isPaths(paths)) return false
  return typeof openedAt === 'string' && !Number.isNaN(Date.parse(openedAt))
}

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * Reads a marker out of whatever the volume answered, or null for anything that is not one.
 *
 * Null covers every way a marker can be unreadable, and they are one answer on purpose: absent,
 * not JSON, no finite `bytes`, no `paths` list of strings, or an `openedAt` that is not an
 * instant. The sweep in `ImportStaging.open` removes what this cannot read, so a session
 * directory holding debris is reclaimed rather than uploaded into.
 *
 * The `openedAt` rule is stated rather than inherited from the comparison that follows it:
 * without it a marker reading `"tuesday"` would be swept only because `Date.parse` gives `NaN`
 * and every comparison against `NaN` is false, which is an accident and not a rule.
 */
export function readMarker(raw: string | null): SessionMarker | null {
  if (raw === null) return null
  const found = parsed(raw)
  return isMarker(found) ? found : null
}

/** The staged paths with one more named, which is a no-op for the next chunk of a staged file. */
export const including = (held: readonly string[], path: string): readonly string[] =>
  held.includes(path) ? held : [...held, path]
