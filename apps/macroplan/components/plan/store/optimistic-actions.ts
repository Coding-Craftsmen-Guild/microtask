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

type Real = (id: string) => string

let made = 0

/**
 * A fresh placeholder for something created and not yet answered.
 *
 * `pending:` cannot collide with a real id, which is a ULID and holds no colon. It is drawn under until the
 * create is answered, which names the real id, and from then on the store reads it as that id
 * (`./plan-store.ts`) — which is how a write made on it meanwhile goes out under an id the API knows.
 *
 * @returns A placeholder no other create on this page has used.
 */
export const placeholderId = (): string => {
  made += 1
  return `pending:${String(made)}`
}

const same = (plan: PlanScreenModel): PlanScreenModel => plan

const asMade = <Draft>(_real: Real, draft: Draft): Draft => draft

const through =
  <Rest extends unknown[]>(
    store: PlanStore,
    send: (planId: string, id: string, ...rest: Rest) => Answer,
    edit: (plan: PlanScreenModel, id: string, ...rest: Rest) => PlanScreenModel,
  ) =>
  (planId: string, id: string, ...rest: Rest): Answer =>
    store.run({
      apply: (plan) => edit(plan, store.real(id), ...rest),
      send: () => send(planId, store.real(id), ...rest),
    })

const carrying =
  <Extra>(
    store: PlanStore,
    send: (planId: string, id: string, extra: Extra) => Answer,
    edit: (plan: PlanScreenModel, id: string, extra: Extra) => PlanScreenModel,
    also: (real: Real, extra: Extra) => Extra,
  ) =>
  (planId: string, id: string, extra: Extra): Answer =>
    store.run({
      apply: (plan) => edit(plan, store.real(id), also(store.real, extra)),
      send: () => send(planId, store.real(id), also(store.real, extra)),
    })

interface Creates<Draft> {
  readonly send: (planId: string, draft: Draft) => Answer
  readonly add: (plan: PlanScreenModel, draft: Draft, id: string) => PlanScreenModel
  readonly list: 'epics' | 'labels' | 'features' | 'items'
  readonly parent?: (real: Real, draft: Draft) => Draft
}

const creating =
  <Draft>(store: PlanStore, { send, add, list, parent = asMade }: Creates<Draft>) =>
  (planId: string, draft: Draft): Answer => {
    const id = placeholderId()
    return store.run({
      apply: (plan) => add(plan, parent(store.real, draft), store.real(id)),
      send: async (_confirm, name) => {
        const answer = await send(planId, parent(store.real, draft))
        const real = answer.ok ? answer.value[list].at(-1)?.id : undefined
        if (real !== undefined) name(id, real)
        return answer
      },
    })
  }

const railAndGroupWrites = (raw: PlanEditActions, store: PlanStore) => ({
  createEpic: creating(store, { send: raw.createEpic, add: addRail, list: 'epics' }),
  renameEpic: through(store, raw.renameEpic, (plan, id, name: string) => changeRail(plan, id, { name })),
  recolourEpic: through(store, raw.recolourEpic, (plan, id, colour: string) => changeRail(plan, id, { colour })),
  reorderEpic: through(store, raw.reorderEpic, reorderRail),
  removeEpic: through(store, raw.removeEpic, removeRail),
  createLabel: creating(store, { send: raw.createLabel, add: addGroup, list: 'labels' }),
  renameLabel: through(store, raw.renameLabel, (plan, id, name: string) => changeGroup(plan, id, { name })),
  recolourLabel: through(store, raw.recolourLabel, (plan, id, colour: string) => changeGroup(plan, id, { colour })),
  removeLabel: through(store, raw.removeLabel, removeGroup),
})

const featureWrites = (raw: PlanEditActions, store: PlanStore) => ({
  labelFeature: carrying(store, raw.labelFeature, labelFeature, (real, labelId) => (labelId === null ? null : real(labelId))),
  createFeature: creating(store, {
    send: raw.createFeature,
    add: addFeature,
    list: 'features',
    parent: (real, draft) => ({ ...draft, epicId: real(draft.epicId) }),
  }),
  renameFeature: through(store, raw.renameFeature, (plan, id, name: string) => changeFeature(plan, id, { name })),
  estimateFeature: through(store, raw.estimateFeature, (plan, id, estimateDays: number | null) =>
    changeFeature(plan, id, { estimateDays }),
  ),
  pinFeature: through(store, raw.pinFeature, (plan, id, pinSprint: number | null) => changeFeature(plan, id, { pinSprint })),
  placeFeature: carrying(store, raw.placeFeature, placeFeature, (real, to) => ({ ...to, epicId: real(to.epicId) })),
  setDependencies: carrying(store, raw.setDependencies, dependFeature, (real, dependsOn) => dependsOn.map(real)),
  removeFeature: through(store, raw.removeFeature, removeFeature),
})

const itemWrites = (raw: PlanEditActions, store: PlanStore) => ({
  createItem: creating(store, {
    send: raw.createItem,
    add: addItem,
    list: 'items',
    parent: (real, draft) => ({ ...draft, featureId: real(draft.featureId) }),
  }),
  renameItem: through(store, raw.renameItem, (plan, id, name: string) => changeItem(plan, id, { name })),
  estimateItem: through(store, raw.estimateItem, (plan, id, estimateDays: number | null) =>
    changeItem(plan, id, { estimateDays }),
  ),
  describeItem: through(store, raw.describeItem, same),
  placeItem: carrying(store, raw.placeItem, placeItem, (real, to) => ({ ...to, featureId: real(to.featureId) })),
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
 * Every id a write carries — its subject, and the second id a few carry (a placement's rail or feature, a
 * group, a dependency list, a create's parent) — is read through the store's `real` each time the write is
 * applied and again when it is sent, never when it was made. So a write made on something still being
 * created — a rename in a just-drawn bar's drawer, an item added under it, a feature put in a group made a
 * moment ago — goes out under the id its create was answered with, never under the placeholder it was
 * drawn with. A create names that id itself: the API appends what it creates, so its real id is the last
 * of its kind in the answer, and the create hands it to the store the moment the answer is in.
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
