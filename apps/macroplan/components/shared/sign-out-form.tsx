'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { SignOutForm as Shell } from '@repo/ui/shell/sign-out-form'
import { signOut } from '../../actions/auth'

const guarded = orNoAnswer(signOut)

const signOutOrNoAnswer = async (): Promise<string> => {
  const failure = await guarded()
  return failure === undefined ? '' : failure.detail
}

/**
 * This app's Sign out: the shared form bound to this app's `signOut` action.
 *
 * The binding is the whole file. Why it is a form and not a link, and why the action is guarded,
 * are recorded on `@repo/ui/shell/sign-out-form`; what is this app's is which action it posts and
 * which session that action ends — `mp_admin`, never Microtask's (ADR 0014, ADR 0032).
 */
export function SignOutForm() {
  return <Shell action={signOutOrNoAnswer} />
}
