'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'
import { TaskPicker } from './task-picker'

/** One item's link, written: the plan, the item, and the task it points at. */
export type LinkWrite = (planId: string, itemId: string, taskId: string) => Promise<ActionResult<Plan>>

/** One item's link, cleared, or its task created — both take the plan and the item and nothing else. */
export type ItemOnlyWrite = (planId: string, itemId: string) => Promise<ActionResult<Plan>>

/** Props for {@link LinkField}. Primitives and unbound actions, which is all a boundary admits. */
export interface LinkFieldProps {
  /** The plan the item belongs to. */
  readonly planId: string

  /** The item whose link this is. */
  readonly itemId: string

  /** The linked task's name, or `null` when this reader is owed none — which includes being unlinked. */
  readonly taskName: string | null

  /** Whether the item's rail resolved to a live Microtask project at all. */
  readonly bound: boolean

  /** Whether that rail is bound at an effective `manage`, which is what creating a task needs. */
  readonly manages: boolean

  /** Every task of the bound project, joined — `splitTasks` in `./task-picker.tsx` undoes it. */
  readonly options: string

  /** Sends the link. */
  readonly link: LinkWrite

  /** Clears it. */
  readonly unlink: ItemOnlyWrite

  /** Creates the task and links it. */
  readonly createTask: ItemOnlyWrite

  /** Whether to offer unlinking — `PlanContentControls.unlinkItem`. */
  readonly mayUnlink: boolean

  /**
   * Whether to offer creating the task — `PlanContentControls.createTask`.
   *
   * **Both halves have to be true**, this and {@link LinkFieldProps.manages}. This one answers "may this
   * reader ask at all", from `item:link`; the other answers "is this rail bound in a way that permits it",
   * from the bridge. Neither implies the other and the API checks both again.
   */
  readonly mayCreate: boolean
}

const ROW = 'flex flex-wrap items-end gap-2'

/** What this field says for each state a rail and an item can be in together. */
export const LINK_WORDS = {
  unbound: 'This item’s rail is not bound to a Microtask project.',
  unlinked: 'Not linked to a task.',
  noTasks: 'That project holds no tasks to link to yet.',
} as const

/**
 * One item's link to a Microtask task: what it is linked to, and the two ways to change it.
 *
 * The picker itself is `./task-picker.tsx`, which also argues why its options cross this boundary as
 * space-joined strings rather than as objects.
 *
 * ### Who sees a picker at all
 *
 * Only a reader the page gave options to, and the route behind them is gated on `epic:bind` — admin-only.
 * Design §7.3 grants an effective `write` holder "the linked task's name", meaning the one task linked;
 * a list of every task in the bound project is materially more than that, so a seat surface is handed no
 * options and draws no picker. That is recorded rather than fixed by widening the gate: the `PUT` behind
 * {@link LinkFieldProps.link} stays a `write` grant because phase 1 decided §7.1's grants and a stored
 * role cannot be re-decided.
 *
 * ### Creating versus linking
 *
 * Two different authorities and two different buttons. Linking chooses an existing task and needs
 * `item:link`. Creating makes one in the other product and needs an effective `manage` on the rail
 * (design §7.2), which no `PlanControls` boolean can express — it depends on what the rail's token holds
 * in Microtask today. So {@link LinkFieldProps.manages} comes from the bridge read rather than from the
 * controls, and the button is absent rather than disabled when it is false: a disabled control invites a
 * reader to wonder what would enable it, where an absent one matches the rail simply not being bound
 * that way.
 */
export function LinkField(props: LinkFieldProps) {
  const { planId, itemId, taskName, bound, manages, options, link, unlink, createTask } = props
  const { mayUnlink, mayCreate } = props
  const [chosen, setChosen] = useState('')
  const [problem, setProblem] = useState('')

  const run = async (call: Promise<ActionResult<Plan>>): Promise<void> => {
    const result = await orNoAnswer(() => call)()
    setProblem(result.ok ? '' : result.detail)
  }

  if (!bound) return <p className="text-[13px] text-muted-foreground">{LINK_WORDS.unbound}</p>

  return (
    <div className="grid gap-1">
      <p className="text-[13px]">{taskName ?? LINK_WORDS.unlinked}</p>
      <div className={ROW}>
        <TaskPicker
          chosen={chosen}
          nothing={LINK_WORDS.noTasks}
          onChoose={setChosen}
          options={options}
        />
        {chosen === '' ? null : (
          <Button onClick={() => void run(link(planId, itemId, chosen))} size="sm" type="button">
            Link
          </Button>
        )}
        {taskName !== null && mayUnlink ? (
          <Button
            onClick={() => void run(unlink(planId, itemId))}
            size="sm"
            type="button"
            variant="outline"
          >
            Unlink
          </Button>
        ) : null}
        {manages && mayCreate && taskName === null ? (
          <Button onClick={() => void run(createTask(planId, itemId))} size="sm" type="button">
            Create the task
          </Button>
        ) : null}
      </div>
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
