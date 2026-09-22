import type { Product, Role, Scope } from '@repo/kernel'
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
 */
export function linkDirectories(
  projects: ProjectStore,
  plans: PlanStore,
): Readonly<Record<Product, LinkDirectory>> {
  return { microtask: projectLinks(projects), macroplan: planLinks(plans) }
}
