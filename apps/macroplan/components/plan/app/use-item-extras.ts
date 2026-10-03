import { useEffect, useState } from 'react'
import type { ItemDrawerRead } from '../../../actions/drawer-reads'
import type { PlanScreenModel } from '../plan-screen-model'
import { usePlanSession } from './plan-session'

const PLACEHOLDER = 'pending:'

/**
 * The rail an item sits under, or `null` when the chain cannot be walked.
 *
 * @param plan - The plan.
 * @param itemId - The item.
 * @returns Its feature's rail, or `null`.
 */
export function railOfItem(plan: PlanScreenModel, itemId: string): string | null {
  const item = plan.items.find((each) => each.id === itemId)
  const feature = plan.features.find((each) => each.id === item?.featureId)
  return plan.epics.find((each) => each.id === feature?.epicId)?.id ?? null
}

interface Held {
  readonly itemId: string
  readonly read: ItemDrawerRead | null
}

/**
 * What an item's drawer reads that the plan does not carry, fetched when the drawer opens on it.
 *
 * `undefined` while it is on its way, `null` where it could not be read — and the drawer is on screen the
 * whole time, drawn from the plan the browser already holds; only the description field and the task
 * picker wait for this (ADR 0069). It is fetched once per item opened, not on every edit: the rail it asks
 * the tasks of is read off the plan at the moment the drawer opens.
 *
 * An item created a moment ago is still under its placeholder id, which the API has never heard of, so it
 * reads as nothing rather than as a request that would be refused.
 *
 * @param itemId - The item the drawer is open on, or `null` when it is not an item's drawer.
 * @returns The description and the tasks, `null`, or `undefined` while loading.
 */
export function useItemExtras(itemId: string | null): ItemDrawerRead | null | undefined {
  const { readItem, store } = usePlanSession()
  const [held, setHeld] = useState<Held | null>(null)
  useEffect(() => {
    if (itemId === null || itemId.startsWith(PLACEHOLDER)) return undefined
    let live = true
    const plan = store.getSnapshot().plan
    const settle = (read: ItemDrawerRead | null): void => {
      if (live) setHeld({ itemId, read })
    }
    readItem(plan.id, itemId, railOfItem(plan, itemId)).then(
      (answer) => settle(answer.ok ? answer.value : null),
      () => settle(null),
    )
    return () => {
      live = false
    }
  }, [itemId, readItem, store])
  if (itemId === null) return undefined
  if (itemId.startsWith(PLACEHOLDER)) return null
  return held?.itemId === itemId ? held.read : undefined
}
