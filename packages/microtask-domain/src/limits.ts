import { Invalid } from '@repo/kernel'
import { LIMITS, type MicrotaskCountKey } from '@repo/contracts'

export {
  LIMITS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_DEPTH,
  type CountLimitKey,
  type LimitKey,
} from '@repo/contracts'

const LABEL: Readonly<Record<MicrotaskCountKey, string>> = {
  tabsPerTask: 'tabs in this task',
  tasksPerProject: 'tasks in this project',
  foldersPerProject: 'folders in this project',
  shareLinksPerProject: 'share links for this project',
  projectsPerProduct: 'projects',
}

/** Collapses whitespace, trims, and caps a display name. */
export function cleanName(value: unknown, fallback?: string): string {
  if (typeof value !== 'string') {
    if (fallback !== undefined) return fallback
    throw new Invalid('Name is required')
  }
  const collapsed = value.replace(/\s+/g, ' ').trim()
  const cleaned = [...collapsed].slice(0, LIMITS.nameLength).join('').trim()
  if (cleaned.length > 0) return cleaned
  if (fallback !== undefined) return fallback
  throw new Invalid('Name is required')
}

/**
 * Throws Invalid when adding one more would exceed a bound.
 *
 * Narrowed to Microtask's half of the count bounds, because no plan key can reach it: a
 * `*-domain` package may not import another (ADR 0014), so `macroplan-domain` re-implements this
 * over the same `@repo/contracts` constants rather than calling it. Typed at `CountLimitKey`,
 * `LABEL` was obliged to carry six plan sentences no caller could ever ask for. `nameLength` is
 * absent for the separate reason {@link cleanName} gives: it truncates, and never throws.
 */
export function assertWithin(key: MicrotaskCountKey, current: number): void {
  if (current >= LIMITS[key]) {
    throw new Invalid(`Too many ${LABEL[key]} — the limit is ${LIMITS[key]}`)
  }
}
