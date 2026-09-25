'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import { BindFields } from './bind-fields'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** Sends one binding: the plan, the rail, and the token and role an admin typed. */
export type BindWrite = (
  planId: string,
  epicId: string,
  binding: { readonly token: string; readonly role: 'view' | 'manage' },
) => Promise<ActionResult<Plan>>

/** Clears one rail's binding: the plan and the rail, and nothing else to send. */
export type UnbindWrite = (planId: string, epicId: string) => Promise<ActionResult<Plan>>

/** Props for {@link BindForm}: primitives and two unbound actions, which is all a boundary admits. */
export interface BindFormProps {
  /** The plan the rail belongs to, which every write is addressed at. */
  readonly planId: string

  /** The rail being bound. */
  readonly epicId: string

  /** Whether this rail already holds a binding, which decides whether unbinding is offered. */
  readonly bound: boolean

  /** Sends the binding. */
  readonly bind: BindWrite

  /** Clears the binding. */
  readonly unbind: UnbindWrite
}

const ROW = 'flex flex-wrap items-end gap-2'

/** The two sentences this form produces itself, before any request is made. */
export const BIND_HINTS = {
  empty: 'Paste the token of a project share link from Microtask.',
  cleared: '',
} as const

/**
 * Pastes a token, picks a role, and binds — or clears a binding that is already there.
 *
 * ### Why the token is typed rather than chosen
 *
 * Nothing in Macroplan can list Microtask's share links, and deliberately: minting a credential in the
 * client-facing product from here would need an authority far larger than the one sealed token design
 * §7.2 bounds (ADR 0052). So an admin mints the seat in Microtask's own share manager, where the role
 * and the revocation live, and pastes what it gave them. The cost is two products in one task; what it
 * buys is that this product can never create a credential over there.
 *
 * ### What this component never holds
 *
 * The token exists in this input and in the one request that carries it, and nowhere else. It is not
 * read back: no response carries a stored token — the API seals it before storing and every view schema
 * refuses a field for it — so after a successful bind the input is cleared and the rail simply reads as
 * bound. There is nothing here to repopulate, which is why this field has none of the "what the server
 * stored" repainting the drawer's own fields need.
 *
 * `type="text"` and `spellCheck={false}` rather than `type="password"`: the value is not a secret from
 * the person typing it — they have just copied it out of the other product — and a masked field would
 * only stop them checking a paste that went wrong, which is the single most likely failure here. It is
 * `autoComplete="off"` so a browser never offers to remember it.
 *
 * A refusal is an inline `role="alert"` line carrying the API's own sentence, because the two 422s this
 * route answers are different jobs: a token that names no project means "paste a project's token", and
 * one holding less than the role asked for means "re-role that seat, or bind lower". Collapsing them
 * into "that did not work" would leave an admin guessing which.
 */
export function BindForm({ planId, epicId, bound, bind, unbind }: BindFormProps) {
  const [token, setToken] = useState('')
  const [role, setRole] = useState<'view' | 'manage'>('view')
  const [problem, setProblem] = useState('')

  const send = async (): Promise<void> => {
    if (token.trim() === '') {
      setProblem(BIND_HINTS.empty)
      return
    }
    const result = await orNoAnswer(bind)(planId, epicId, { token: token.trim(), role })
    setProblem(result.ok ? BIND_HINTS.cleared : result.detail)
    if (result.ok) setToken('')
  }

  const clear = async (): Promise<void> => {
    const result = await orNoAnswer(unbind)(planId, epicId)
    setProblem(result.ok ? BIND_HINTS.cleared : result.detail)
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <BindFields onRole={setRole} onToken={setToken} role={role} token={token} />
        <Button onClick={() => void send()} size="sm" type="button">
          {bound ? 'Rebind' : 'Bind'}
        </Button>
        {bound ? (
          <Button onClick={() => void clear()} size="sm" type="button" variant="outline">
            Unbind
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
