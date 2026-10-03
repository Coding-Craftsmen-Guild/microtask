import type { ActionResult } from '../../../actions/result'
import type { PlanEditActions } from '../edit-actions'
import type { PlanScreenModel } from '../plan-screen-model'
import {
  addFeature,
  changeFeature,
  dependFeature,
  labelFeature,
  placeFeature,
  removeFeature,
} from './feature-edits'
import { addGroup, changeGroup, removeGroup } from './group-edits'
import { addItem, changeItem, linkItem, placeItem, removeItem } from './item-edits'
import type { PlanStore } from './plan-store'
import { addRail, changeRail, removeRail, reorderRail } from './rail-edits'

type Answer = Promise<ActionResult<PlanScreenModel>>

type Edit<Rest extends unknown[]> = (plan: PlanScreenModel, ...rest: Rest) => PlanScreenModel

let made = 0

/**
 * A fresh placeholder for something created and not yet answered.
 *
 * `pending:` cannot collide with a real id, which is a ULID and holds no colon. It lives only until the
 * create's answer replaces the whole plan with one naming the real entity.
 *
 * @returns A placeholder no other create on this page has used.
 */
export const placeholderId = (): string => {
  made += 1
  return `pending:${String(made)}`
}

const same = (plan: PlanScreenModel): PlanScreenModel => plan

const through =
  <Rest extends unknown[]>(store: PlanStore, send: (planId: string, ...rest: Rest) => Answer, edit: Edit<Rest>) =>
  (planId: string, ...rest: Rest): Answer =>
    store.run({ apply: (plan) => edit(plan, ...rest), send: () => send(planId, ...rest) })

const creating =
  <Draft>(
    store: PlanStore,
    send: (planId: string, draft: Draft) => Answer,
    add: (plan: PlanScreenModel, draft: Draft, id: string) => PlanScreenModel,
  ) =>
  (planId: string, draft: Draft): Answer => {
    const id = placeholderId()
    return store.run({ apply: (plan) => add(plan, draft, id), send: () => send(planId, draft) })
  }

const railAndGroupWrites = (raw: PlanEditActions, store: PlanStore) => ({
  createEpic: creating(store, raw.createEpic, addRail),
  renameEpic: through(store, raw.renameEpic, (plan, id: string, name: string) => changeRail(plan, id, { name })),
  recolourEpic: through(store, raw.recolourEpic, (plan, id: string, colour: string) => changeRail(plan, id, { colour })),
  reorderEpic: through(store, raw.reorderEpic, reorderRail),
  removeEpic: through(store, raw.removeEpic, removeRail),
  createLabel: creating(store, raw.createLabel, addGroup),
  renameLabel: through(store, raw.renameLabel, (plan, id: string, name: string) => changeGroup(plan, id, { name })),
  recolourLabel: through(store, raw.recolourLabel, (plan, id: string, colour: string) => changeGroup(plan, id, { colour })),
  removeLabel: through(store, raw.removeLabel, removeGroup),
})

const featureWrites = (raw: PlanEditActions, store: PlanStore) => ({
  labelFeature: through(store, raw.labelFeature, labelFeature),
  createFeature: creating(store, raw.createFeature, addFeature),
  renameFeature: through(store, raw.renameFeature, (plan, id: string, name: string) => changeFeature(plan, id, { name })),
  estimateFeature: through(store, raw.estimateFeature, (plan, id: string, estimateDays: number | null) =>
    changeFeature(plan, id, { estimateDays }),
  ),
  pinFeature: through(store, raw.pinFeature, (plan, id: string, pinSprint: number | null) =>
    changeFeature(plan, id, { pinSprint }),
  ),
  placeFeature: through(store, raw.placeFeature, placeFeature),
  setDependencies: through(store, raw.setDependencies, dependFeature),
  removeFeature: through(store, raw.removeFeature, removeFeature),
})

const itemWrites = (raw: PlanEditActions, store: PlanStore) => ({
  createItem: creating(store, raw.createItem, addItem),
  renameItem: through(store, raw.renameItem, (plan, id: string, name: string) => changeItem(plan, id, { name })),
  estimateItem: through(store, raw.estimateItem, (plan, id: string, estimateDays: number | null) =>
    changeItem(plan, id, { estimateDays }),
  ),
  describeItem: through(store, raw.describeItem, same),
  placeItem: through(store, raw.placeItem, placeItem),
  removeItem: through(store, raw.removeItem, removeItem),
})

const bridgeWrites = (raw: PlanEditActions, store: PlanStore) => ({
  bindEpic: through(store, raw.bindEpic, same),
  unbindEpic: through(store, raw.unbindEpic, same),
  linkItem: through(store, raw.linkItem, (plan, id: string, taskId: string) => linkItem(plan, id, taskId)),
  unlinkItem: through(store, raw.unlinkItem, (plan, id: string) => linkItem(plan, id, null)),
  createTask: through(store, raw.createTask, same),
})

/**
 * The plan's writes, each put through the store so the screen changes before the answer (ADR 0069).
 *
 * Every member keeps the signature it had, so nothing that calls a write changes: a field still awaits
 * the answer to say why it was refused, and a gesture still reads the created id off the answered plan.
 * What changes is when the screen moves — now, from the edit in `./*-edits.ts` that mirrors the domain
 * rule the write will run — and that the writes go out one at a time, in the order they were made.
 *
 * Three members change nothing on screen. A description is not in the plan the screen draws, and the
 * bridge writes (`bindEpic`, `unbindEpic`, `createTask`) are about another product: what they did is in
 * the bridge read the server re-renders with, which is why those three still refresh on the server
 * (`actions/plan-write.ts`). A link and an unlink do set the one field the plan itself carries.
 *
 * @param raw - The Server Actions this surface may call: unbound for the admin, token-bound for a seat.
 * @param store - The store the screen renders from.
 * @returns The same writes, optimistic.
 */
export function optimisticActions(raw: PlanEditActions, store: PlanStore): PlanEditActions {
  return {
    ...railAndGroupWrites(raw, store),
    ...featureWrites(raw, store),
    ...itemWrites(raw, store),
    ...bridgeWrites(raw, store),
  }
}
