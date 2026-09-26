'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { LIMITS } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useState, useTransition, type FormEvent } from 'react'
import type { ActionFailure } from '../../actions/result'

/** Props for {@link CreatePlan}. */
export interface CreatePlanProps {
  /** Creates the plan. Success navigates to it, so only a refusal ever comes back. */
  onCreate: (plan: {
    readonly name: string
    readonly startDate: string
  }) => Promise<ActionFailure | undefined>

  /** Today as `YYYY-MM-DD`, decided by the page so the markup is one fixed string. */
  readonly today: string
}

const CARD = 'grid gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10'

/** What this form says before any request is made, and the two labels a reader is given. */
export const CREATE_PLAN_WORDS = {
  name: 'New plan name',
  start: 'First working day',
  submit: 'Create plan',
} as const

/**
 * The inline create form at the top of the plans index: a name, a start date, and one button.
 *
 * ### Two fields, because a plan cannot be dated later by omission
 *
 * `CreatePlanPayload` requires `startDate` and this is why: every other date in a plan is **derived**
 * — `startDate` plus a working-day offset — so it is the one date a plan is allowed to type, and a
 * plan created without one would have no day 0 for the forward pass to count from. The other two
 * settings are left off deliberately: the service defaults `sprintLengthDays` to 10 and `timezone` to
 * `UTC`, and a form that asked for them here would be asking two questions an admin has no answer to
 * before the plan exists. Both are editable afterwards through `plans.update`, which is the route
 * `plan:retime` gates.
 *
 * The date defaults to {@link CreatePlanProps.today}, computed by the page in **UTC** — the same zone
 * the service defaults the plan to, so the default date and the default calendar agree. An admin in a
 * far-eastern zone near midnight may see yesterday and change it, which is a date input's own job.
 *
 * ### What a refusal does
 *
 * The field keeps what was typed and the API's own sentence appears beneath it, so an admin fixes the
 * name rather than retyping it — and a create the server never answered says so too, which is what
 * `orNoAnswer` is for. A name that trims to nothing makes **no request at all**, matching
 * `CreateProject` one app over: `required` catches an empty field and cannot catch a field holding four
 * spaces, so the guard is for the case the attribute does not cover.
 *
 * **An empty date needs no sentence of ours and deliberately has none.** `required` on a date input is
 * enforced by the browser before `submit` fires, and a date input's value is either `''` or a real
 * `YYYY-MM-DD` — there is no third state for us to word. A message of our own here would be unreachable
 * code that reads like a safety net; the test below pins the blocking instead, so removing `required`
 * fails rather than silently sending a plan with no first working day.
 *
 * Success is a `redirect` thrown by the action and is deliberately not caught: the plan that was just
 * created is the page the admin wants, and its id exists for the first time in that response.
 */
export function CreatePlan({ onCreate, today }: CreatePlanProps) {
  const [problem, setProblem] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const startDate = String(form.get('startDate') ?? '').trim()
    if (name === '') return
    startTransition(async () => {
      const failure = await orNoAnswer(onCreate)({ name, startDate })
      setProblem(failure?.detail ?? '')
    })
  }

  return (
    <form className={CARD} onSubmit={submit}>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={CREATE_PLAN_WORDS.name}
          className="min-w-[16rem] flex-1"
          maxLength={LIMITS.nameLength}
          name="name"
          placeholder="New plan name — e.g. ACME Q4 delivery"
          required
        />
        <Input
          aria-label={CREATE_PLAN_WORDS.start}
          className="w-[11rem]"
          defaultValue={today}
          name="startDate"
          required
          type="date"
        />
        <Button disabled={pending} type="submit">
          {CREATE_PLAN_WORDS.submit}
        </Button>
      </div>
      {problem === '' ? null : (
        <p className="text-[12.5px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}
