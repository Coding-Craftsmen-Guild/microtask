import { NotFound, type Product } from '@repo/kernel'
import type { ItemDocument, PlanItem } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'
import { assertWithin, cleanDescription, cleanName } from '../limits.js'
import type { PlanContext } from './context.js'
import { placeAmong } from './positions.js'
import type { ItemRef, PlanRef } from './refs.js'
import { assertFeature, densifiedItems, featureItems, pickItem } from './structure-mapper.js'

/**
 * What a new item is created from. A new item is linked to no Microtask task.
 *
 * `estimateDays` spells `| undefined` beside its `null`, for the reason
 * `@repo/microtask-domain`'s `ScopeRequest` and this package's own `NewPlan` already record: under
 * `exactOptionalPropertyTypes` a validated request body infers
 * `estimateDays?: number | null | undefined`, and would otherwise not be assignable here. The three
 * spellings are two meanings — `undefined` and absent both mean "say nothing", `null` means "no
 * estimate" — which is what the `?? null` in {@link ItemService.add} reads them as.
 */
export interface NewItem {
  readonly featureId: string
  readonly name: string
  readonly estimateDays?: number | null | undefined
}

/**
 * What may change about an item. An absent key leaves the field; `null` clears the estimate.
 *
 * `estimateDays` needs both spellings because zero is a real answer — an item that takes no time —
 * so "no estimate yet" cannot be written as a falsy value, and collapsing absent and `null` into
 * one optional would leave "clear it" with no spelling at all. `linkedTaskId` is absent from this
 * interface for the reason `binding` is absent from `EpicChanges`: it is the bridge, phase 4 writes
 * it, and nothing reachable from here may.
 *
 * Both members spell `| undefined` for the reason {@link NewItem}'s estimate does: a validated
 * `PATCH` body infers `name?: string | undefined`, and {@link ItemService.update} tests each key
 * against `undefined`, so present-and-undefined leaves the field exactly as absent does.
 */
export interface ItemChanges {
  readonly name?: string | undefined
  readonly estimateDays?: number | null | undefined
}

/** Where an item is going: which feature, and where inside it. */
export interface ItemPlacement {
  readonly featureId: string
  readonly position: number
}

const applied = (current: PlanItem, changes: ItemChanges, updatedAt: string): PlanItem => ({
  ...current,
  name: changes.name !== undefined ? cleanName(changes.name) : current.name,
  estimateDays: changes.estimateDays !== undefined ? changes.estimateDays : current.estimateDays,
  updatedAt,
})

/** Adds, edits, moves, removes and describes the items of one plan. */
export class ItemService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /**
   * Adds an item after the last item of its feature, refusing to exceed `itemsPerPlan`.
   *
   * No item file is written: an item nobody has described yet has nothing to store, and
   * {@link readOne} answers `''` for a file that is not there. So this is a manifest-only write, and
   * the first {@link writeDescription} is what creates the file.
   */
  async add(at: PlanRef, item: NewItem): Promise<PlanManifest> {
    const name = cleanName(item.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      assertFeature(current, item.featureId)
      assertWithin('itemsPerPlan', current.items.length)
      const stamp = this.#ctx.clock.now()
      const created: PlanItem = {
        id: this.#ctx.ids.entityId(),
        featureId: item.featureId,
        name,
        position: featureItems(current, item.featureId).length,
        estimateDays: item.estimateDays ?? null,
        linkedTaskId: null,
        createdAt: stamp,
        updatedAt: stamp,
      }
      return this.#save(at.product, { ...current, items: [...current.items, created] })
    })
  }

  /** Renames an item or re-estimates it, moving nothing and leaving its task link alone. */
  async update(at: PlanRef, itemId: string, changes: ItemChanges): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const next = applied(pickItem(current, itemId), changes, this.#ctx.clock.now())
      const items = current.items.map((each) => (each.id === itemId ? next : each))
      return this.#save(at.product, { ...current, items })
    })
  }

  /**
   * Links an item to a Microtask task id, replacing whatever link it already held.
   *
   * **Checks neither that the item's epic is bound nor that the task exists.** Both are questions
   * about Microtask, and this package cannot reach Microtask — only `apps/api` can (design §7.2),
   * the same reasoning {@link EpicService.bind} gives for not verifying a token. A cross-product
   * rule enforced from inside a package that cannot see the other product would be a check in name
   * only: it could refuse a shape that looks wrong and let through a task id that does not exist,
   * or a real one in a project the plan was never bound to, so it would buy false confidence rather
   * than safety. The route is what refuses an unbound rail; this method succeeds on one, because a
   * `write`-role edit reaching this far has already cleared every check this package is positioned
   * to make.
   *
   * Linking an already-linked item **replaces** the stored id rather than refusing, for the same
   * reason a second {@link EpicService.bind} replaces: re-pointing an item at a different task is
   * one write of the field, not an edit this method has grounds to question.
   */
  async link(at: PlanRef, itemId: string, taskId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickItem(current, itemId)
      const stamp = this.#ctx.clock.now()
      const items = current.items.map((each) =>
        each.id === itemId ? { ...each, linkedTaskId: taskId, updatedAt: stamp } : each,
      )
      return this.#save(at.product, { ...current, items })
    })
  }

  /**
   * Unlinks an item, setting its task link to `null`. Idempotent: unlinking an item that is
   * already unlinked changes nothing but the stamp, rather than raising.
   */
  async unlink(at: PlanRef, itemId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickItem(current, itemId)
      const stamp = this.#ctx.clock.now()
      const items = current.items.map((each) =>
        each.id === itemId ? { ...each, linkedTaskId: null, updatedAt: stamp } : each,
      )
      return this.#save(at.product, { ...current, items })
    })
  }

  /**
   * Moves one item inside its feature or to another, renumbering both groups densely.
   *
   * Stamps the plan and nothing inside it. A position is the plan's arrangement of its contents
   * rather than a property of the thing arranged, and a move renumbers a whole group: stamping only
   * the item the caller named, while its siblings silently take new positions, would make
   * `updatedAt` mean "someone edited this" on one record and nothing on the others in the same
   * write. The plan's own stamp is what records that the arrangement changed.
   */
  async place(at: PlanRef, itemId: string, to: ItemPlacement): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const found = pickItem(current, itemId)
      assertFeature(current, to.featureId)
      const moved: PlanItem = { ...found, featureId: to.featureId }
      const swapped = current.items.map((each) => (each.id === itemId ? moved : each))
      const group = placeAmong(
        swapped.filter((each) => each.featureId === to.featureId),
        itemId,
        to.position,
      )
      const placed = new Map(group.map((each) => [each.id, each]))
      const items = densifiedItems(swapped.map((each) => placed.get(each.id) ?? each))
      return this.#save(at.product, { ...current, items })
    })
  }

  /** Removes an item and its file, renumbering what is left of its group densely. */
  async remove(at: PlanRef, itemId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickItem(current, itemId)
      const items = densifiedItems(current.items.filter((each) => each.id !== itemId))
      const next = { ...current, items, updatedAt: this.#ctx.clock.now() }
      await this.#ctx.store.deleteItems(at.product, next, [itemId])
      return next
    })
  }

  /**
   * Reads one item beside the description its own file holds, or `''` when there is none.
   *
   * `PlanStore.readItem` answers `null` both for a file that is absent and for one that will not
   * decode, and neither is reported as a failure here: an item created and never described has no
   * file at all, so absence is the ordinary case, and one unreadable file is not a broken plan —
   * the item, its name and its estimate all live in the manifest and read back fine. What a caller
   * sees for either is an empty description, and nothing throws.
   *
   * Takes no lock: it is a read, and a caller holding the lock may use it.
   */
  async readOne(at: ItemRef): Promise<{ item: PlanItem; description: string }> {
    const current = await this.#read(at)
    const item = pickItem(current, at.itemId)
    const file = await this.#ctx.store.readItem(at.product, at.planId, at.itemId)
    return { item, description: file?.description ?? '' }
  }

  /**
   * Replaces one item's description, cleaning it first and writing its file before the manifest.
   *
   * `cleanDescription` runs here rather than at the wire alone, because this method is reachable
   * from places that schema is not, and the cap it applies is in UTF-8 bytes where the contract's
   * is in UTF-16 units (`limits.ts`). The write goes through `saveItem`, which puts the file down
   * before the manifest, so an interrupted write can only leave a description nobody is pointed at
   * rather than a pointer to bytes that were never written (ADR 0006).
   */
  async writeDescription(at: ItemRef, description: string): Promise<PlanItem> {
    const cleaned = cleanDescription(description)
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const stamp = this.#ctx.clock.now()
      const item: PlanItem = { ...pickItem(current, at.itemId), updatedAt: stamp }
      const existing = await this.#ctx.store.readItem(at.product, at.planId, at.itemId)
      const file: ItemDocument = {
        id: at.itemId,
        description: cleaned,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      }
      const items = current.items.map((each) => (each.id === at.itemId ? item : each))
      await this.#ctx.store.saveItem(at.product, { ...current, items, updatedAt: stamp }, file)
      return item
    })
  }

  /** Reads the plan or throws NotFound. Takes no lock, so a locked caller may use it. */
  async #read(at: PlanRef): Promise<PlanManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.planId)
    if (found === null) throw new NotFound('Plan not found')
    return found
  }

  /** Writes the manifest, stamping the plan as changed. Assumes the caller holds the lock. */
  async #save(product: Product, next: PlanManifest): Promise<PlanManifest> {
    const stamped = { ...next, updatedAt: this.#ctx.clock.now() }
    await this.#ctx.store.saveManifest(product, stamped)
    return stamped
  }
}
