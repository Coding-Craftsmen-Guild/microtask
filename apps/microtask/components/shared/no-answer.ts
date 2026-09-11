import { unstable_rethrow } from 'next/navigation'
import type { ActionFailure } from '../../actions/result'

/**
 * What a Server Action call that got no answer comes back as: the shape of a refusal, with the
 * status `ActionFailure` reserves for a server that could not be reached.
 *
 * It says the server did not answer and nothing more. A connection that drops after the request
 * left may have dropped after the write landed, so it cannot promise nothing changed.
 */
export const NO_ANSWER: ActionFailure = {
  ok: false,
  status: 0,
  detail: 'The server did not answer. Check your connection and try again.',
}

/**
 * `call`, answering {@link NO_ANSWER} where it would have rejected.
 *
 * A Server Action answers every refusal as a value, but the call itself **rejects** when the
 * transport fails — the connection drops, the server restarts, or it no longer knows the action's
 * id after a deploy — and a caller written for values then waits forever or leaves the rejection
 * unhandled. An action reference cannot be wrapped on the server before it reaches the client,
 * so the guard is here, on the client, and turns that rejection into the failed outcome a refusal
 * already produces, which every caller renders.
 *
 * **A redirect is let through.** Next answers an action's `redirect()` by navigating and by
 * rejecting the call with its redirect error, which its own handler picks up; turned into a
 * failure here it would put a sentence on screen for a navigation that is already happening.
 * `unstable_rethrow` is the public way to tell the two apart.
 */
export function orNoAnswer<Args extends unknown[], Result>(
  call: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | ActionFailure> {
  return async (...args) => {
    try {
      return await call(...args)
    } catch (error) {
      unstable_rethrow(error)
      return NO_ANSWER
    }
  }
}

type Refusable<Actions> = {
  readonly [Name in keyof Actions]: Actions[Name] extends (...args: never[]) => Promise<infer Result>
    ? ActionFailure extends Result
      ? Actions[Name]
      : never
    : never
}

/**
 * An actions object with every member passed through {@link orNoAnswer}, under the same names.
 *
 * A component takes its writes as one object a page hands in — the admin's Server Actions, or
 * a share link's — so guarding the object where it enters is what makes every call behind it
 * guarded, including calls added later. Only an object whose every action can already answer
 * an `ActionFailure` is accepted, so the guard never gives a caller a shape it does not handle.
 */
export function eachOrNoAnswer<Actions extends Refusable<Actions>>(actions: Actions): Actions {
  const guarded = Object.entries(actions).map(([name, call]) => [
    name,
    orNoAnswer(call as (...args: unknown[]) => Promise<unknown>),
  ])
  return Object.fromEntries(guarded) as Actions
}
