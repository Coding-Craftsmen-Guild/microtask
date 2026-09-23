import { isUlid, type Product, type Role, type Scope } from '@repo/kernel'
import type { PlanStore } from '@repo/macroplan-domain'
import type { ProjectStore } from '@repo/microtask-domain'

const MICROTASK: Product = 'microtask'
const MACROPLAN: Product = 'macroplan'

/** The two facts a principal is built from, read fresh on every request. */
export interface LiveLink {
  readonly role: Role
  readonly scope: Scope
}

/** Reads one token's live role and scope from whichever manifest holds it. */
export interface LinkDirectory {
  /** Answers null when the container is gone or holds no such token — a dead link, not an error. */
  readLink(containerId: string, token: string): Promise<LiveLink | null>
}

const liveOnly = (inner: LinkDirectory): LinkDirectory => ({
  readLink: async (containerId, token) =>
    isUlid(containerId) ? inner.readLink(containerId, token) : null,
})

const projectLinks = (store: ProjectStore): LinkDirectory => ({
  readLink: async (containerId, token) => {
    const found = await store.readManifest(MICROTASK, containerId)
    const link = found?.shareLinks.find((one) => one.token === token)
    return link === undefined ? null : { role: link.role, scope: link.scope }
  },
})

const planLinks = (store: PlanStore): LinkDirectory => ({
  readLink: async (containerId, token) => {
    const found = await store.readManifest(MACROPLAN, containerId)
    const link = found?.shareLinks.find((one) => one.token === token)
    if (link === undefined) return null
    return { role: link.role, scope: { kind: 'plan', planId: containerId } }
  },
})

/**
 * One directory per product, built together so neither can be wired under the other's key.
 *
 * `PrincipalResolver` indexes this by the product its token index named, so the product each
 * adapter reads under has to be the key it sits at. A `Record` keyed by {@link Product} is what
 * makes that total: a third product added to `PRODUCTS` is a compile error here until it has a
 * directory, rather than a bearer that resolves to nothing at runtime. Constructing the pair in one
 * place is the other half — two separately exported adapters could be handed to the resolver
 * crossed over, and a crossed pair reads the wrong product's root and answers 401 for every live
 * link in both.
 *
 * A plan's scope is **derived** rather than stored: `PlanShareLink` carries no scope field, because
 * a plan link reaches its plan and there is no narrower root inside one to name (unlike a Microtask
 * task scope). The derivation is from the container the index resolved the token to, so it can only
 * ever name the plan whose manifest the token was just found in.
 *
 * **Both are wrapped so that a container id which is not a ULID reads as a dead link.** Each store's
 * `readManifest` *throws* `Invalid` on one rather than answering null, and the id reaching here comes
 * from whatever the token index holds, not from a validated request param. Nothing records a
 * non-ULID one today — `warmTokenIndex` filters by `isUlid` and every service mints its ids — so the
 * check is unreachable, and that is exactly why it is cheaper than the alternative: were it ever to
 * be reached, an unauthenticated request carrying a dead bearer would be answered **500** by the
 * resolver instead of 401, which is a worse failure than the one it is guarding. The wrapper is
 * applied at this one construction site rather than inside each adapter, so a third product cannot
 * be wired in without it.
 */
export function linkDirectories(
  projects: ProjectStore,
  plans: PlanStore,
): Readonly<Record<Product, LinkDirectory>> {
  return { microtask: liveOnly(projectLinks(projects)), macroplan: liveOnly(planLinks(plans)) }
}
