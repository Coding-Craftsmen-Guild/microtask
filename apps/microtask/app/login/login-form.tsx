'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { LoginForm as Shell, type SignInState } from '@repo/ui/shell/login-form'
import { signIn } from '../../actions/auth'

const guarded = orNoAnswer(signIn)

const signInOrNoAnswer = async (previous: SignInState, form: FormData): Promise<SignInState> => {
  const state = await guarded(previous, form)
  return 'ok' in state ? { message: state.detail } : state
}

/** What the form needs from the page: where to land after a successful sign-in. */
export interface LoginFormProps {
  /** The already-sanitised `?next=`, echoed back to the action in a hidden field. */
  readonly next: string
}

/**
 * This app's sign-in form: the shared form bound to this app's `signIn` action.
 *
 * The binding is the whole file, and the guard is the reason it exists here rather than in
 * `@repo/ui`: a sign-in that gets no answer at all — the connection drops, or a deploy retired
 * the action's id — must say so on the form's message line rather than fall through to an error
 * boundary, and telling that apart from the redirect a *successful* sign-in throws needs Next.
 */
export function LoginForm({ next }: LoginFormProps) {
  return <Shell action={signInOrNoAnswer} next={next} />
}
