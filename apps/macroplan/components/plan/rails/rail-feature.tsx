'use client'

import { NewName } from '../drawer/new-name'
import type { ActionResult } from '../../../actions/result'
import type { NewFeature, Plan } from '@repo/api-client'

/** Adds one feature: the plan, and the draft naming the rail it goes on. */
export type CreateFeatureWrite = (
  planId: string,
  feature: NewFeature,
) => Promise<ActionResult<Plan>>

/** Props for {@link RailFeature}. */
export interface RailFeatureProps {
  /** The plan the feature is added to. */
  readonly planId: string

  /** The rail it goes on, which is the field this control exists to supply. */
  readonly epicId: string

  /** That rail's name, so the box says which lane a feature is being added to. */
  readonly railName: string

  /** Sends it. */
  readonly createFeature: CreateFeatureWrite
}

/** What this control is called, and what it suggests a feature is named. */
export const RAIL_FEATURE_WORDS = { action: 'Add feature', hint: 'Named, then estimated in its own drawer' } as const

/**
 * Adds a feature to **this** rail — the other half of what made a new plan a dead end.
 *
 * `CreateControls` in the drawer can already add a feature, and it can only be reached from a feature that
 * already exists: it takes its `railId` from the subject the drawer is open on, so on a plan with no
 * features there was nothing to open and no way in. This is the same write with the rail supplied by the
 * **row** instead of by an open subject, which is what breaks the circle — a rail is created, and a feature
 * can go on it at once.
 *
 * It reuses `../drawer/new-name.tsx` rather than growing a third copy of that box, and the reuse is exact:
 * a submit rather than a blur, because a half-typed name tabbed past would become a feature; an empty box
 * refused rather than ignored; `maxLength` at `LIMITS.nameLength`, since the API truncates past it and
 * answers 200. That file's TSDoc holds all three arguments and they are not restated here.
 *
 * `add` is a closure built **in the browser**, around one action and this row's two ids. That is why this
 * module carries `'use client'` and `new-name.tsx` does not: what crosses the boundary is this component's
 * props — the plan id, the rail id, a name, and one unbound module function — and `module-boundaries.test.tsx`
 * admits exactly that. A closure built on the server and passed down would arrive as a `bound ` function,
 * which is the one smuggling mechanism ADR 0040 names and the sweep refuses.
 */
export function RailFeature({ planId, epicId, railName, createFeature }: RailFeatureProps) {
  return (
    <NewName
      action={RAIL_FEATURE_WORDS.action}
      add={(name) => createFeature(planId, { epicId, name })}
      fieldId={`new-feature-${epicId}`}
      hint={RAIL_FEATURE_WORDS.hint}
      label={`Name of a new feature on ${railName}`}
    />
  )
}
