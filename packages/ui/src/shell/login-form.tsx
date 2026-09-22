'use client'

import { useActionState } from 'react'
import { Button } from '../components/button'
import { Input } from '../components/input'

/** What the sign-in form renders: a message, or nothing while no attempt has failed. */
export interface SignInState {
  /** The sentence to show under the form, or `null` before the first attempt. */
  readonly message: string | null
}

/**
 * The `useActionState` action a sign-in form drives.
 *
 * Spelled structurally rather than imported from `@repo/app-session`, which owns the same shape
 * as the type its `refusalFor` returns. This package renders and depends on React and nothing
 * else — no Next, no session, no API — and one two-field interface is a cheaper price for that
 * than an edge from the UI package to a server one. The two are structurally identical, so an
 * app passes its action here with no adapter and a drift becomes a compile error at the call site.
 */
export type SignInAction = (previous: SignInState, form: FormData) => Promise<SignInState>

/** Props for {@link LoginForm}. */
export interface LoginFormProps {
  /** The already-sanitised `?next=`, echoed back to the action in a hidden field. */
  readonly next: string

  /** The app's sign-in action, already guarded against a call that gets no answer. */
  readonly action: SignInAction
}

const INITIAL: SignInState = { message: null }

/**
 * The admin password form both products sign in through: one field, one button, one message line.
 *
 * `next` travels as a hidden field and is sanitised **again** by the action. The page's copy is
 * for the form; the action's copy is the one that decides where the browser goes, because a form
 * post is attacker-controlled whatever the page rendered into it.
 *
 * The message line is always in the DOM with a fixed minimum height, as the app being replaced
 * did, so a refusal does not make the button jump under the cursor. Guarding the action against
 * a call that gets no answer is the app's, not this component's: the guard needs Next's redirect
 * error to let a successful sign-in's navigation through, and that is a dependency this package
 * does not take.
 */
export function LoginForm({ next, action }: LoginFormProps) {
  const [state, submit, pending] = useActionState(action, INITIAL)
  return (
    <form action={submit} className="grid gap-3">
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
