import { useMemo, useRef } from 'react'
import { drawerSubject, type DrawerSubject } from '../drawer/subject'
import type { PlanScreenModel } from '../plan-screen-model'

/** A subject and the plan it was found in, which its tabs are worded from. */
export interface HeldSubject {
  readonly plan: PlanScreenModel
  readonly subject: DrawerSubject
}

/**
 * The drawer's subject, read off the plan as it stands — or, while a change is being saved, the last one.
 *
 * A delete is applied to the plan the moment it is confirmed, and the drawer closes once the API has
 * answered it (`../drawer/delete-control.tsx`). In between, the subject is already gone from the plan, and
 * without this the drawer would say "no longer on this plan" for one round trip before it closed. So while
 * the store is saving, the last plan the subject was found in stands in; once nothing is pending, a subject
 * that is gone is gone, and a refused delete has put it back anyway.
 *
 * @param plan - The plan as it stands.
 * @param saving - Whether a change is still being saved.
 * @param asked - The subject the address names.
 * @returns The subject and its plan, or `undefined` for a subject the plan does not hold.
 */
export function useSubject(
  plan: PlanScreenModel,
  saving: boolean,
  asked: { readonly kind: 'feature' | 'item'; readonly id: string },
): HeldSubject | undefined {
  const { kind, id } = asked
  const found = useMemo(() => drawerSubject(plan, kind, id), [plan, kind, id])
  const last = useRef<HeldSubject | undefined>(undefined)
  if (found !== undefined) {
    last.current = { plan, subject: found }
    return last.current
  }
  return saving ? last.current : undefined
}
