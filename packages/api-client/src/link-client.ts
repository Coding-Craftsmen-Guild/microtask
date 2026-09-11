import { createSurface, type MicrotaskApi } from './surface.js'
import { createTransport } from './transport.js'
import type { ClientOptions } from './types.js'

/**
 * A client holding a **share-link** token: the credential a client of the business is given.
 *
 * The same shape as `AdminClient` apart from `credential`, and unassignable to it in either
 * direction because of that one field. See {@link AdminClient} for why the brand is a real
 * property rather than a phantom one.
 *
 * Every operation is present here, including the ones a share token will be refused. That is not
 * an oversight: the role and scope a link carries are read from the manifest on every request,
 * so what a given link may do can change between two calls — and a client that decided in
 * advance would be holding a stale copy of a decision only the API can make (ADR 0009). A call
 * outside the link's scope comes back as `ApiError` with `status` 403.
 */
export interface LinkClient extends MicrotaskApi {
  /** Names which credential this client carries. It is `'link'` and can be nothing else. */
  readonly credential: 'link'
}

/**
 * Builds a link client over a share token.
 *
 * The token identifies a seat rather than a person, so it is the whole credential: there is no
 * login, nothing to refresh, and revoking the link is what ends the session. It still travels
 * beside the service key, because the API refuses either credential on its own (ADR 0012).
 *
 * `currentShare()` is the call to make first. A link holder knows its token and nothing else —
 * not which project it opens, not what role it carries — and that route is the only one that
 * tells it, derived from the bearer rather than from anything the caller has to supply.
 */
export function createLinkClient(options: ClientOptions, shareToken: string): LinkClient {
  return { credential: 'link', ...createSurface(createTransport(options, shareToken)) }
}
