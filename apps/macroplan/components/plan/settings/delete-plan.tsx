'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useState } from 'react'
import type { ActionFailure } from '../../../actions/result'

/**
 * Deletes one plan. Answers a refusal, or nothing at all because it navigated.
 *
 * `ActionFailure | undefined` rather than an `ActionResult`, which is `createPlan`'s shape from the other
 * direction: a plan that is gone has no page to stay on, so success redirects to the index and there is
 * nothing to answer with.
 */
export type DeleteWrite = (planId: string) => Promise<ActionFailure | undefined>

/** Props for {@link DeletePlan}. */
export interface DeletePlanProps {
  /** The plan to delete. */
  readonly planId: string

  /** Its name, quoted in the question so nobody deletes the wrong one from a second tab. */
  readonly name: string

  /** Deletes it. Authority is the action's to re-derive, never this component's to assert. */
  readonly remove: DeleteWrite
}

/**
 * What a plan delete takes with it, said before it is chosen.
 *
 * The seats are named last and deliberately, because they are the half nobody expects: the other three
 * losses are this plan's own, where a revoked seat is somebody **else's** access disappearing without
 * their being told. `PlanService.remove` drops the tokens from the index inside the same locked write that
 * removes the files, so there is no window in which a revoked client still gets in — and no window in
 * which it could be warned either. A holder's next request is a dead link.
 */
export const DELETE_PLAN_MESSAGE =
  'Its rails, features, items and their descriptions are deleted, and every share link to it stops ' +
  'working at once — anyone holding one is not told. This cannot be undone.'

/**
 * The destructive control on a plan's settings panel, behind a confirm that names the plan.
 *
 * The confirm is `danger`, which focuses nothing that confirms, so Enter cannot delete a plan — only a
 * click can (`@repo/ui/shell/confirm-dialog`). That asymmetry is the shared dialog's own and is reproduced
 * from the app being replaced; `apps/microtask`'s `DeleteProject` is the same decision one product over,
 * and this is its twin rather than a second design.
 *
 * The trigger says `Delete` and the confirm says `Delete plan`, which is `apps/microtask`'s pairing and is
 * load-bearing rather than cosmetic: Radix marks the rest of the page `aria-hidden` while the modal is
 * open, so two buttons sharing one label leaves a test — and a screen reader — with one match and no way to
 * say which. The `title` carries the full sentence for a pointer.
 *
 * A refusal is said beside the button. Success says nothing, because success is a navigation: the action
 * redirects to the plans index, so this component is unmounted before it could render anything.
 */
export function DeletePlan({ planId, name, remove }: DeletePlanProps) {
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState('')

  const confirmed = async (): Promise<void> => {
    setAsking(false)
    const failure = await orNoAnswer(remove)(planId)
    setProblem(failure === undefined || failure.ok ? '' : failure.detail)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => setAsking(true)}
        size="sm"
        title="Delete plan"
        type="button"
        variant="destructive"
      >
        Delete
      </Button>
      {problem === '' ? null : (
        <span className="text-[12.5px] text-destructive" role="alert">
          {problem}
        </span>
      )}
      <ConfirmDialog
        confirmLabel="Delete plan"
        danger
        message={DELETE_PLAN_MESSAGE}
        onCancel={() => setAsking(false)}
        onConfirm={() => void confirmed()}
        open={asking}
        title={`Delete ${name}?`}
      />
    </div>
  )
}
