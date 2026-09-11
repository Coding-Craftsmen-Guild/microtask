import { createSurface, type MicrotaskApi } from './surface.js'
import { createTransport } from './transport.js'
import type { ClientOptions } from './types.js'

/**
 * A client holding an **admin** token: the credential a password login mints.
 *
 * `credential` is the brand, and it is a real property rather than a phantom one. As a type it
 * makes this and `LinkClient` mutually unassignable — they are otherwise the same shape, so the
 * brand is the only thing separating them and the compiler refuses either in the other's place.
 * As a value it costs one string and makes a mix-up visible in a log or a debugger, which a
 * phantom brand erased at compile time cannot do.
 *
 * The two kinds are not interchangeable because the authority behind them is not: an admin token
 * is workspace-wide and short-lived, a share token is scoped to one project or one task and
 * lives until it is revoked. A function that takes "a client" and is handed the wrong one would
 * make a request that succeeds or 403s depending on which credential happened to be in scope,
 * which is the kind of confusion ADR 0012 exists to make impossible (ADR 0013).
 */
export interface AdminClient extends MicrotaskApi {
  /** Names which credential this client carries. It is `'admin'` and can be nothing else. */
  readonly credential: 'admin'
}

/**
 * Builds an admin client over a token `login` returned.
 *
 * It takes {@link ClientOptions} as well as the token because **this package reads no
 * environment variable anywhere** (ADR 0012, and `n/no-process-env` is an error here). Where the
 * API is and which app is calling are facts about the deployment, so they are passed in by the
 * one layer that may know them. A client that read `process.env` would also be unusable from a
 * browser bundle without inlining the service key into it, which is exactly the leak the two
 * credentials exist to prevent.
 *
 * Both credentials go on every request. A bearer with no service key and a service key with no
 * bearer are each a 401, so a client that could send only one could not talk to this API at all.
 */
export function createAdminClient(options: ClientOptions, adminToken: string): AdminClient {
  return { credential: 'admin', ...createSurface(createTransport(options, adminToken)) }
}
