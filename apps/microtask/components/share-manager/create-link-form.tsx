'use client'

import type { NewShareLink } from '@repo/api-client'
import { LIMITS, type RoleValue } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useRef, useState, type FormEvent } from 'react'
import { ROLE_LABEL } from './labels'
import type { ScopeChoice } from './types'

const ROLES: readonly RoleValue[] = ['view', 'write', 'manage']

const SELECT = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm'

const roleOf = (value: FormDataEntryValue | null): RoleValue =>
  ROLES.find((role) => role === value) ?? 'view'

/** Props for {@link CreateLinkForm}. */
export interface CreateLinkFormProps {
  /** The scopes to offer, tasks first: the first is the default (ADR 0011). */
  choices: readonly ScopeChoice[]
  /** Every folder and task a project-scoped link would open. */
  exposure: string
  /** Mints the link, answering whether it was minted. */
  onCreate: (seat: NewShareLink) => Promise<boolean>
}

/**
 * The add-link form: who it is for, what it may do, and what it opens.
 *
 * A **task** is the default scope, and a project-scoped link is minted only after a confirm that
 * lists every folder and task it would open — a project spans clients, so the wide scope has to be
 * chosen with its consequences in view (ADR 0011). A name is required: legacy allowed a blank one,
 * but the API refuses a new link without one, so an empty submit is stopped here with no request.
 */
export function CreateLinkForm({ choices, exposure, onCreate }: CreateLinkFormProps) {
  const name = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const [waiting, setWaiting] = useState<NewShareLink | null>(null)
  const send = async (seat: NewShareLink) => {
    if ((await onCreate(seat)) && name.current !== null) name.current.value = ''
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const choice = choices.find((one) => one.value === data.get('scope')) ?? choices[0]
    const seat = { name: String(data.get('name') ?? '').trim(), role: roleOf(data.get('role')) }
    setProblem(seat.name === '' ? 'Say who this link is for.' : '')
    if (seat.name === '' || choice === undefined) return
    if (choice.scope.kind === 'project') setWaiting({ ...seat, scope: choice.scope })
    else void send({ ...seat, scope: choice.scope })
  }
  return (
    <>
      <form className="grid gap-2" onSubmit={submit}>
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Who is this link for?" className="min-w-40 flex-1" maxLength={LIMITS.nameLength} name="name" placeholder="Who is this link for? e.g. Jane at ACME" ref={name} />
          <select aria-label="Access" className={SELECT} defaultValue="view" name="role">
            {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
          </select>
          <select aria-label="Opens" className={SELECT} defaultValue={choices[0]?.value} name="scope">
            {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
          <Button type="submit">Add link</Button>
        </div>
        {problem !== '' ? <p className="text-[12.5px] text-destructive" role="alert">{problem}</p> : null}
      </form>
      <ConfirmDialog
        confirmLabel="Add project link"
        danger
        message={exposure}
        onCancel={() => setWaiting(null)}
        onConfirm={() => {
          setWaiting(null)
          if (waiting !== null) void send(waiting)
        }}
        open={waiting !== null}
        title="Share the whole project?"
      />
    </>
  )
}
