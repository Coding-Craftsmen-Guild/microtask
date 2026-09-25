import type { NewPlanSeat } from '@repo/api-client'
import { LIMITS, type RoleValue } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useRef, useState, type FormEvent } from 'react'
import { NEEDS_A_NAME, ROLES, ROLE_LABEL } from './seat-words'

const FORM = 'grid gap-2'

const LINE = 'flex flex-wrap gap-2'

const FIELD = 'min-w-40 flex-1'

const SELECT = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm'

const PROBLEM = 'text-[12.5px] text-destructive'

const roleOf = (value: FormDataEntryValue | null): RoleValue =>
  ROLES.find((role) => role === value) ?? 'view'

/** Props for {@link MintSeat}. */
export interface MintSeatProps {
  /** Mints the seat, answering whether it was minted. */
  readonly onMint: (seat: NewPlanSeat) => Promise<boolean>
}

/**
 * The add-a-seat form: who it is for, and what it may do.
 *
 * **No scope to choose**, which is the whole difference from
 * `apps/microtask/components/share-manager/create-link-form.tsx` and its confirm: a Microtask link is
 * minted over a task or over a whole project, so ADR 0011 requires the wider of the two be asked for by
 * name. A plan has exactly one shareable scope and the route's path already names it —
 * `CreatePlanShareLinkPayload` declares no `scope` at all, so there is no choice here for a form to get
 * wrong and no exposure to warn about (`packages/contracts/src/plan-share-payloads.ts`).
 *
 * A name is required and an empty submit sends nothing: `CreatePlanShareLinkPayload.name` is an
 * `EntityName`, which the API refuses empty — so this is the refusal said in the form rather than a 422
 * fetched to learn it. The role defaults to `view`, the weakest of the three, so the careless gesture
 * hands out the least authority.
 *
 * The field is cleared only when the mint **succeeded**, so a refused one leaves the name to try again
 * with.
 */
export function MintSeat({ onMint }: MintSeatProps) {
  const name = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const send = async (seat: NewPlanSeat) => {
    if ((await onMint(seat)) && name.current !== null) name.current.value = ''
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const asked = { name: String(data.get('name') ?? '').trim(), role: roleOf(data.get('role')) }
    setProblem(asked.name === '' ? NEEDS_A_NAME : '')
    if (asked.name !== '') void send(asked)
  }
  return (
    <form className={FORM} onSubmit={submit}>
      <div className={LINE}>
        <Input
          aria-label="Who is this seat for?"
          className={FIELD}
          maxLength={LIMITS.nameLength}
          name="name"
          placeholder="Who is this seat for? e.g. Jane at ACME"
          ref={name}
        />
        <select aria-label="Access" className={SELECT} defaultValue="view" name="role">
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
        <Button type="submit">Add seat</Button>
      </div>
      {problem === '' ? null : (
        <p className={PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}
