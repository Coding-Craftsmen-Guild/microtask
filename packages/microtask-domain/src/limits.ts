import { Invalid } from '@repo/kernel'

/** How deep a document may nest before a walk stops descending. */
export const MAX_DOCUMENT_DEPTH = 100

/** The largest a stored document may be, in JSON bytes. */
export const MAX_DOCUMENT_BYTES = 2_000_000

/** Every collection count this product bounds. Also bounds what a share-link holder can create. */
export const LIMITS = {
  nameLength: 80,
  tabsPerTask: 40,
  tasksPerProject: 500,
  foldersPerProject: 100,
  shareLinksPerProject: 50,
  projectsPerProduct: 500,
} as const

/** A bound that can be exceeded. */
export type LimitKey = keyof typeof LIMITS

/** A bound on a collection. Name length is enforced by truncation, never by `assertWithin`. */
export type CountLimitKey = Exclude<LimitKey, 'nameLength'>

const LABEL: Readonly<Record<LimitKey, string>> = {
  nameLength: 'name length',
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

/** Throws Invalid when adding one more would exceed a bound. */
export function assertWithin(key: CountLimitKey, current: number): void {
  if (current >= LIMITS[key]) {
    throw new Invalid(`Too many ${LABEL[key]} — the limit is ${LIMITS[key]}`)
  }
}
