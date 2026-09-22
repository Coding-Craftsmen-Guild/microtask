'use client'

import { LIMITS } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useState, useTransition, type FormEvent } from 'react'
import type { ActionFailure } from '../../actions/result'
import { orNoAnswer } from '@repo/app-session/no-answer'

/** Props for {@link CreateProject}. */
export interface CreateProjectProps {
  /** Creates a project. Success navigates to it, so only a refusal ever comes back. */
  onCreate: (name: string) => Promise<ActionFailure | undefined>
}

/** The gold headline button the app being replaced used for its two headline actions. */
export const GOLD = 'bg-gold text-brand hover:bg-gold-deep'

/**
 * The inline create form at the top of the projects index.
 *
 * A name that trims to nothing is a silent no-op with no request, as it was. A refusal leaves the
 * field as typed — the user fixes the name rather than retyping it — and says why beneath it, and
 * so does a create the server never answered (`orNoAnswer`). Success redirects, which is let
 * through to Next rather than caught.
 */
export function CreateProject({ onCreate }: CreateProjectProps) {
  const [problem, setProblem] = useState('')
  const [pending, startTransition] = useTransition()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (name === '') return
    startTransition(async () => {
      const failure = await orNoAnswer(onCreate)(name)
      setProblem(failure?.detail ?? '')
    })
  }
  return (
    <form className="grid gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10" onSubmit={submit}>
      <div className="flex gap-2">
        <Input
          aria-label="New project name"
          maxLength={LIMITS.nameLength}
          name="name"
          placeholder="New project name — e.g. ACME Website"
          required
        />
        <Button className={GOLD} disabled={pending} type="submit">
          Create project
        </Button>
      </div>
      {problem !== '' ? <p className="text-[12.5px] text-destructive" role="alert">{problem}</p> : null}
    </form>
  )
}
