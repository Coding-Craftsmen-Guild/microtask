'use client'

import { useActionState } from 'react'

/** The sign-out call, already guarded: it answers a sentence, or the empty string for success. */
export type SignOutAction = () => Promise<string>

/** Props for {@link SignOutForm}. */
export interface SignOutFormProps {
  /** The app's sign-out action, already guarded against a call that gets no answer. */
  readonly action: SignOutAction
}

/**
 * Sign out: a form posting the app's `signOut` action, never a link, with a line for a sign-out
 * that got no answer.
 *
 * A form rather than a link because ending a session changes state, a `GET` must not, and Next
 * prefetches every `<Link>` it renders — the reason `proxy.ts` stopped clearing a cookie on a
 * `GET` of `/login` (ADR 0032). The action arrives already wrapped by the app, so a sign-out the
 * server never answers — the connection drops, or a deploy retired the action's id — says so
 * beside the button rather than falling to an error boundary, and the admin can press it again.
 * The redirect a successful sign-out answers with is let through by that wrapper.
 */
export function SignOutForm({ action }: SignOutFormProps) {
  const [message, submit, pending] = useActionState(action, '')
  return (
    <form action={submit} className="flex items-center gap-3">
      <span className="text-[12.5px] text-white/90" role="alert">
        {message}
      </span>
      <button className="cursor-pointer text-[13px] text-white/80 hover:text-white" disabled={pending} type="submit">
        Sign out
      </button>
    </form>
  )
}
