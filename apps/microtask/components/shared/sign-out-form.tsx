'use client'

import { useActionState } from 'react'
import { signOut } from '../../actions/auth'
import { orNoAnswer } from '@repo/app-session/no-answer'

const guarded = orNoAnswer(signOut)

const signOutOrNoAnswer = async (): Promise<string> => {
  const failure = await guarded()
  return failure === undefined ? '' : failure.detail
}

/**
 * Sign out: a form posting the `signOut` action, never a link, with a line for a sign-out that
 * got no answer.
 *
 * A form rather than a link because ending a session changes state, a `GET` must not, and Next
 * prefetches every `<Link>` it renders — the reason `proxy.ts` stopped clearing a cookie on a
 * `GET` of `/login` (ADR 0032). The action is called through `orNoAnswer`, as the sign-in form's
 * is, so a sign-out the server never answers — the connection drops, or a deploy retired the
 * action's id — says so beside the button rather than falling to an error boundary, and the admin
 * can press it again. The redirect a successful sign-out answers with is let through.
 */
export function SignOutForm() {
  const [message, action, pending] = useActionState(signOutOrNoAnswer, '')
  return (
    <form action={action} className="flex items-center gap-3">
      <span className="text-[12.5px] text-white/90" role="alert">
        {message}
      </span>
      <button className="cursor-pointer text-[13px] text-white/80 hover:text-white" disabled={pending} type="submit">
        Sign out
      </button>
    </form>
  )
}
