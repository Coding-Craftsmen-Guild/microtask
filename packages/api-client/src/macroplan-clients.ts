import { createMacroplanSurface, type MacroplanApi } from './macroplan-surface.js'
import { createTransport } from './transport.js'
import type { ClientOptions } from './types.js'

/**
 * A Macroplan client holding an **admin** token: the credential a password login mints.
 *
 * `credential` is the brand, and it is a real property rather than a phantom one, for the reason
 * {@link AdminClient} gives: as a type it makes this and {@link MacroplanLinkClient} mutually
 * unassignable, and as a value it costs one string and makes a mix-up visible in a log.
 */
export interface MacroplanAdminClient extends MacroplanApi {
  /** Names which credential this client carries. It is `'admin'` and can be nothing else. */
  readonly credential: 'admin'
}

/**
 * A Macroplan client holding a **plan seat** token: the credential a client of the business is given.
 *
 * Every operation is present here, including the ones a seat will be refused. The role a seat carries
 * and the plan it is rooted in are read from the manifest on every request, so a client that decided
 * in advance would hold a stale copy of a decision only the API can make (ADR 0009). A call outside
 * the seat's plan comes back as `ApiError` with `status` 403.
 *
 * A seat is scoped to a whole plan and to nothing narrower (ADR 0053), which is why this client has
 * no scope of its own to carry: `currentShare()` is what names the plan it opens.
 */
export interface MacroplanLinkClient extends MacroplanApi {
  /** Names which credential this client carries. It is `'link'` and can be nothing else. */
  readonly credential: 'link'
}

/**
 * Either Macroplan client a request may present, which is what a page holds.
 *
 * It lives here rather than in an app because both members do, and an app-side union would go stale
 * the moment a third credential exists. Microtask spells the same union in `apps/microtask/lib/api.ts`
 * instead, which is the asymmetry: that copy has to be revised by hand whenever this package grows a
 * credential kind, and this one cannot be.
 */
export type MacroplanSessionClient = MacroplanAdminClient | MacroplanLinkClient

/**
 * Builds a Macroplan admin client over a token `login` returned.
 *
 * It takes {@link ClientOptions} as well as the token because **this package reads no environment
 * variable anywhere** (ADR 0012, and `n/no-process-env` is an error here). Where the API is and which
 * app is calling are facts about the deployment, passed in by the one layer that may know them.
 *
 * Both credentials go on every request: a bearer with no service key and a service key with no
 * bearer are each a 401. Neither of them names the product. `x-api-key` says which app is calling
 * and confers no authority whatsoever (ADR 0012) — `requirePrincipal` accepts any recognised key
 * against either product's subtree, and this repo's own harness drives `/v1/macroplan` with the key
 * it registered as `microtask`. What names the product is the **path** (ADR 0014), which is why
 * this constructor exists beside `createAdminClient` rather than as an argument to it.
 */
export function createMacroplanAdminClient(
  options: ClientOptions,
  adminToken: string,
): MacroplanAdminClient {
  return { credential: 'admin', ...createMacroplanSurface(createTransport(options, adminToken)) }
}

/**
 * Builds a Macroplan link client over a plan seat token.
 *
 * The token identifies a seat rather than a person, so it is the whole credential: there is no
 * login, nothing to refresh, and revoking the seat is what ends the session.
 *
 * `currentShare()` is the call to make first. A seat holder knows its token and nothing else — not
 * which plan it opens, not what role it carries — and that route is the only one that tells it,
 * derived from the bearer rather than from anything the caller has to supply.
 */
export function createMacroplanLinkClient(
  options: ClientOptions,
  shareToken: string,
): MacroplanLinkClient {
  return { credential: 'link', ...createMacroplanSurface(createTransport(options, shareToken)) }
}
