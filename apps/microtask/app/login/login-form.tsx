'use client'

import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useActionState } from 'react'
import { signIn } from '../../actions/auth'
import type { SignInState } from '../../lib/login'

const INITIAL: SignInState = { message: null }

/** What the form needs from the page: where to land after a successful sign-in. */
export interface LoginFormProps {
  /** The already-sanitised `?next=`, echoed back to the action in a hidden field. */
  readonly next: string
}

/**
 * The admin password form: one field, one button, one message line.
 *
 * `next` travels as a hidden field and is sanitised **again** by the action. The page's copy is
 * for the form; the action's copy is the one that decides where the browser goes, because a form
 * post is attacker-controlled whatever the page rendered into it.
 *
 * The message line is always in the DOM with a fixed minimum height, as the app being replaced
 * did, so a refusal does not make the button jump under the cursor.
 */
export function LoginForm({ next }: LoginFormProps) {
  const [state, action, pending] = useActionState(signIn, INITIAL)
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <Input
        name="password"
        type="password"
        placeholder="Admin password"
        aria-label="Admin password"
        autoComplete="current-password"
        autoFocus
        required
      />
      <Button type="submit" disabled={pending}>
        Sign in
      </Button>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {state.message ?? ''}
      </p>
    </form>
  )
}
