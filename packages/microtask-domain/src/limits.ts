import { Invalid } from '@repo/kernel'
import { LIMITS, type CountLimitKey, type LimitKey } from '@repo/contracts'

export {
  LIMITS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_DEPTH,
  type CountLimitKey,
  type LimitKey,
} from '@repo/contracts'

const LABEL: Readonly<Record<LimitKey, string>> = {
  nameLength: 'name length',
  tabsPerTask: 'tabs in this task',
  tasksPerProject: 'tasks in this project',
  foldersPerProject: 'folders in this project',
  shareLinksPerProject: 'share links for this project',
  projectsPerProduct: 'projects',
  plansPerProduct: 'plans',
  epicsPerPlan: 'epics in this plan',
  featuresPerPlan: 'features in this plan',
  itemsPerPlan: 'items in this plan',
  edgesPerPlan: 'dependencies in this plan',
  shareLinksPerPlan: 'share links for this plan',
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
