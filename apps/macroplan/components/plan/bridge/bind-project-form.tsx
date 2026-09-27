'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

const ROW = 'flex flex-wrap items-end gap-2'

const INPUT =
  'h-9 w-[24ch] rounded-md border border-input bg-transparent px-2 font-mono text-[13px]'

const SELECT = 'h-9 rounded-md border border-input bg-transparent px-2 text-[13px]'

/** Binds a rail by naming a project: the plan, the rail, and the project and role chosen. */
export type BindProjectWrite = (
  planId: string,
  epicId: string,
  binding: { readonly projectId: string; readonly role: 'view' | 'manage' },
) => Promise<ActionResult<Plan>>

/** The sentences this form produces itself, before any request is made. */
export const BIND_PROJECT_HINTS = {
  empty: 'Name the Microtask project to bind this rail to.',
  cleared: '',
} as const

/** Props for {@link BindProjectForm}: primitives and one unbound action, which is all a boundary admits. */
export interface BindProjectFormProps {
  /** The plan the rail belongs to, which the write is addressed at. */
  readonly planId: string

  /** The rail being bound. */
  readonly epicId: string

  /** Sends the binding. */
  readonly bind: BindProjectWrite
}

/**
 * Binds a rail to a Microtask project by naming it, the API minting the seat.
 *
 * ### Why this is the form to reach for
 *
 * `bind-form.tsx` beside it asks an admin to go to Microtask, mint a share link, copy its token, come back
 * and paste it — two products in one task, which is what ADR 0052 recorded as the cost of never letting this
 * product manufacture a credential. This form asks for the project and does the middle three steps on the
 * server, so nothing secret is typed here and nothing secret is stored in a paste buffer.
 *
 * A project id is **not a secret**: it is in the URL of every page of that project in Microtask. So none of
 * `bind-fields.tsx`'s reasoning about masking, `autoComplete` and repopulation applies — this is an ordinary
 * field, and the browser remembering it is a convenience rather than a leak.
 *
 * ### Why an id and not a picker
 *
 * A list of the admin's Microtask projects would be a better control and needs something that does not exist
 * yet: a read from this product into the other one that is scoped to *projects the caller may share*. The
 * bridge reads a bound project's tasks and nothing wider (`BoundTaskList`), and widening it to "every project
 * you could bind" is its own decision about what Macroplan may learn about Microtask — not one to make as a
 * side effect of a form. Until then the id is typed, and the ADR records the gap.
 *
 * ### The refusal is the API's own sentence
 *
 * Two authorities are asked — `epic:bind` on the plan and `share:create` on the project — and they fail
 * differently: the first means this reader may not bind rails at all, the second that they may not share that
 * project. Collapsing them into "that did not work" would leave an admin guessing which, so the API's detail
 * is rendered verbatim in an inline `role="alert"`.
 */
export function BindProjectForm({ planId, epicId, bind }: BindProjectFormProps) {
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<'view' | 'manage'>('view')
  const [problem, setProblem] = useState('')

  const send = async (): Promise<void> => {
    if (projectId.trim() === '') {
      setProblem(BIND_PROJECT_HINTS.empty)
      return
    }
    const result = await orNoAnswer(bind)(planId, epicId, { projectId: projectId.trim(), role })
    setProblem(result.ok ? BIND_PROJECT_HINTS.cleared : result.detail)
    if (result.ok) setProjectId('')
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <input
          aria-label="Microtask project to bind this rail to"
          className={INPUT}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="project id"
          spellCheck={false}
          type="text"
          value={projectId}
        />
        <select
          aria-label="Role to bind at"
          className={SELECT}
          onChange={(event) => setRole(event.target.value === 'manage' ? 'manage' : 'view')}
          value={role}
        >
          <option value="view">view — read names and progress</option>
          <option value="manage">manage — and create tasks</option>
        </select>
        <Button onClick={() => void send()} size="sm" type="button">
          Bind project
        </Button>
      </div>
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
