import { refusalFor as sessionRefusalFor, type SignInState } from '@repo/app-session/login'
import { SERVICE_UNAVAILABLE } from './problem'

export { LOGIN_REFUSED, reportLoginRefusal, signInDestination } from '@repo/app-session/login'
export type { SignInState } from '@repo/app-session/login'

/**
 * What a failed sign-in tells the browser: {@link sessionRefusalFor} carrying this product's name.
 *
 * Every rule about what a refusal may disclose is shared with Macroplan — a wrong password and an
 * unknown service key are indistinguishable, and only a 5xx or an unreachable API is told apart.
 * The one thing this app supplies is the sentence for that last case, because it names Microtask.
 */
export function refusalFor(error: unknown): SignInState {
  return sessionRefusalFor(error, SERVICE_UNAVAILABLE)
}
