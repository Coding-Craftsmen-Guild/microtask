import { Invalid, NotFound, type Product } from '@repo/kernel'
import { todayIn } from '@repo/schedule'
import type { PlanManifest } from '../entities/plan.js'
import { assertWithin, cleanName } from '../limits.js'
import type { PlanContext } from './context.js'
import type { PlanRef } from './refs.js'

const DEFAULT_SPRINT_LENGTH_DAYS = 10
const DEFAULT_TIMEZONE = 'UTC'

function assertTimezone(timezone: string): void {
  try {
    todayIn(timezone, new Date(0))
  } catch (error) {
    if (error instanceof RangeError) throw new Invalid(`Unknown time zone: "${timezone}"`)
    throw error
  }
}

function applyChanges(current: PlanManifest, changes: PlanChanges, updatedAt: string): PlanManifest {
  return {
    ...current,
    name: changes.name !== undefined ? cleanName(changes.name) : current.name,
    startDate: changes.startDate ?? current.startDate,
    sprintLengthDays: changes.sprintLengthDays ?? current.sprintLengthDays,
    timezone: changes.timezone ?? current.timezone,
    updatedAt,
  }
}

/** What a new plan is created from. `sprintLengthDays` defaults to 10 and `timezone` to `'UTC'`. */
export interface NewPlan {
  readonly name: string
  readonly startDate: string
  readonly sprintLengthDays?: number
  readonly timezone?: string
}

/** What may change about a plan itself. An absent key leaves that setting alone. */
export interface PlanChanges {
  readonly name?: string
  readonly startDate?: string
  readonly sprintLengthDays?: number
  readonly timezone?: string
}

/** Creates, reads, retimes and removes plans. */
export class PlanService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /** Lists every plan for a product, newest update first. */
  async list(product: Product): Promise<readonly PlanManifest[]> {
    return this.#ctx.store.listManifests(product)
  }

  /** Reads one plan, or throws NotFound. Takes no lock, so a locked writer may call it. */
  async read(at: PlanRef): Promise<PlanManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.planId)
    if (found === null) throw new NotFound('Plan not found')
    return found
  }

  /**
   * Creates an empty plan, refusing to exceed `plansPerProduct`.
   *
   * The count `assertWithin` bounds against comes from `listManifests`, a directory walk, and that
   * walk has to run inside `lock.run`: read outside it, two concurrent creates at the cap would
   * both see room for one more and both write, which is exactly the race the lock exists to close.
   *
   * `timezone` is checked again here even though `@repo/contracts`' `Timezone` schema already runs
   * the same `Intl` probe at the wire, because this method is reachable from places that schema is
   * not — this package may not depend on `@repo/contracts`' Zod schemas, and a future caller inside
   * this process is not guaranteed to have gone through the HTTP layer first. Defence at the write
   * is the point: a zone this runtime cannot resolve must be refused here, not discovered later
   * when a canvas fails to draw.
   */
  async create(product: Product, settings: NewPlan): Promise<PlanManifest> {
    const name = cleanName(settings.name)
    const timezone = settings.timezone ?? DEFAULT_TIMEZONE
    assertTimezone(timezone)
    return this.#ctx.lock.run(async () => {
      const existing = await this.#ctx.store.listManifests(product)
      assertWithin('plansPerProduct', existing.length)
      const stamp = this.#ctx.clock.now()
      const manifest: PlanManifest = {
        id: this.#ctx.ids.entityId(),
        name,
        startDate: settings.startDate,
        sprintLengthDays: settings.sprintLengthDays ?? DEFAULT_SPRINT_LENGTH_DAYS,
        timezone,
        epics: [],
        features: [],
        items: [],
        shareLinks: [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      await this.#ctx.store.saveManifest(product, manifest)
      return manifest
    })
  }

  /**
   * Changes a plan's name or its calendar settings, leaving its contents alone.
   *
   * Changing `startDate` or `sprintLengthDays` moves every derived date and every sprint boundary,
   * and that is allowed and unremarked: the schedule is derived from these two fields, so moving
   * the origin is the one edit that genuinely means "the whole plan shifts". A `pinSprint` is an
   * index, so it moves with the grid along with everything else — which is correct, since a pin
   * means "not before sprint 5", and sprint 5 is wherever sprint 5 now is. A new `timezone` is
   * checked the same way `create` checks one, and for the same reason.
   */
  async update(at: PlanRef, changes: PlanChanges): Promise<PlanManifest> {
    if (changes.timezone !== undefined) assertTimezone(changes.timezone)
    return this.#ctx.lock.run(async () => {
      const current = await this.read(at)
      const next = applyChanges(current, changes, this.#ctx.clock.now())
      await this.#ctx.store.saveManifest(at.product, next)
      return next
    })
  }

  /** Removes a plan, everything under it, and the share tokens that pointed at it. */
  async remove(at: PlanRef): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const removed = await this.#ctx.store.deletePlan(at.product, at.planId)
      if (!removed) throw new NotFound('Plan not found')
      this.#ctx.tokens.remove({ product: at.product, containerId: at.planId })
    })
  }
}
