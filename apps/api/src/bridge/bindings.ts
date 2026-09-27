import { effectiveBridgeRole, seal, type Role, type Scope } from '@repo/kernel'
import type { EpicBinding } from '@repo/macroplan-domain'
import type { ProjectRef, ShareLink, ShareLinkRequest } from '@repo/microtask-domain'
import type { Bearers } from './bridge-service.js'

/**
 * Why a pasted token could not become a binding, in the two sentences an admin can act on.
 *
 * `'unknown'` means the token names no Microtask project: it was mistyped, it has been revoked, it is
 * an admin bearer, or it is scoped to one task rather than to a project. All four are "paste a project
 * share token from Microtask", so they are one answer.
 *
 * `'weaker'` means the token is real but holds less in Microtask than the role being asked for here —
 * binding at `manage` with a `view` seat's token. That is a different fix: mint or re-role the seat in
 * Microtask, or bind at the role it actually holds.
 */
export type BindingRefusal = 'unknown' | 'weaker'

/** A pasted token turned into a storable binding, or the reason it cannot be. */
export type PreparedBinding =
  | { readonly ok: true; readonly binding: EpicBinding }
  | { readonly ok: false; readonly reason: BindingRefusal }

/**
 * What a rail's minted seat is called in Microtask's own share manager.
 *
 * Fixed here rather than taken from the caller, and it names **Macroplan** rather than the rail: whoever is
 * looking at that project's seats needs to know what this credential is for and which product will stop
 * working if they revoke it. A rail's name would be more precise and is the wrong precision — it is a name in
 * a product where no rail exists, and it goes stale the moment somebody renames the rail over here.
 */
export const MINTED_SEAT_NAME = 'Macroplan bridge'

/**
 * The scope a rail's seat is minted at: a whole project, never one task.
 *
 * Narrower than the kernel's `ProjectScope`, which admits a task scope too. A rail binds to a **project**
 * (design §7.2) and an item then names a task inside it, so a task-scoped seat would be a binding that could
 * reach exactly one of the tasks the rail is supposed to span — and every other item under it would read as
 * linked to something the credential cannot see.
 */
export type SeatScope = Extract<Scope, { kind: 'project' }>

/** Mints a project-scoped seat over one project. The half of Microtask's share service this needs. */
export interface SeatMinter {
  create: (at: ProjectRef, request: ShareLinkRequest) => Promise<ShareLink>
}

/** What {@link Bindings} needs: the sealing secret, the resolver, and the minter. */
export interface BindingsOptions {
  readonly secret: string
  readonly bearers: Bearers

  /**
   * Microtask's own share-link service, which is what mints the seat {@link Bindings.mint} then seals.
   *
   * A narrow {@link SeatMinter} rather than the whole `ShareLinkService`, so this class can neither list a
   * project's seats nor revoke one: the route above it is allowed to create a credential and nothing else,
   * and a structural type naming one method is what makes that true of the code rather than of the caller.
   */
  readonly seats: SeatMinter
}

/**
 * Turns a token an admin pasted into the binding an epic stores.
 *
 * ### Why the project is derived and never supplied
 *
 * `BindEpicPayload` carries a token and a role and **no `projectId`**. A token resolves to exactly one
 * project through the index that already owns it, so a derived id cannot disagree with the token it
 * came from — where a supplied one could, leaving a route to choose which half to believe. Deciding
 * that by reading the token is the same as not asking, and deciding it by trusting the caller is how a
 * rail ends up claiming to be bound to a project whose token it does not hold.
 *
 * ### Why this is not a third method on `BridgeService`
 *
 * That class has exactly two methods and a test that says so, because design §7.2 bounds a `manage`
 * binding by promising the write path is one operation. This is neither half of that reach: it resolves
 * a bearer the admin has just typed, before any binding exists to read through. Keeping it here leaves
 * that surface assertion meaning what it says.
 *
 * ### Why the token's role is checked against the declared one now
 *
 * A binding is attenuated on every read — `BridgeService` takes the weaker of the declared role and
 * the token's live role — so binding at `manage` with a `view` token would *work*, silently, and read
 * as `view` forever. The admin's screen would say `manage` and the product would behave as `view`.
 * Refusing at bind time is what makes the stored role a fact rather than an aspiration, and the admin
 * is standing in front of Microtask's own share manager at that moment, which is where the fix is.
 *
 * The check does **not** make the stored role permanent: a token downgraded *after* binding still
 * attenuates on read, and it must, because nothing here runs again when somebody re-roles a seat in
 * the other product.
 */
export class Bindings {
  readonly #secret: string
  readonly #bearers: Bearers
  readonly #seats: SeatMinter

  /** Creates the minter over its secret, its resolver and Microtask's share service. */
  constructor(options: BindingsOptions) {
    this.#secret = options.secret
    this.#bearers = options.bearers
    this.#seats = options.seats
  }

  /**
   * Mints a project-scoped seat over the named project, then seals it as a binding.
   *
   * ### The credential never exists outside this method
   *
   * The token is created, resolved and sealed inside one call, and what comes back is an {@link EpicBinding}
   * carrying `sealedToken` — the same shape {@link Bindings.prepare} answers for a pasted one, so nothing
   * downstream can tell the two apart and ADR 0061’s bridge read is untouched. No response body on the route
   * above carries it, because `planView` has no field for a token to go in.
   *
   * ### It goes back through `prepare`, which looks redundant and is not
   *
   * The freshly minted token is resolved through the same index a pasted one is, and checked against the
   * declared role by the same comparison. Two things fall out of that. The stored `projectId` is **derived**
   * rather than echoed from the payload, so a binding cannot claim a project its token does not reach even
   * here; and the seat is confirmed to have landed at the role asked for rather than assumed to have, which
   * is what keeps the stored role a fact on this path as well as on the pasted one.
   *
   * An `unknown` refusal from here would mean the seat was minted and then did not resolve, which is a fault
   * rather than a paste error — and it answers the same refusal shape anyway, because a route with two
   * vocabularies for one outcome is a route with two error paths to test.
   *
   * ### What it does not do
   *
   * It does not check that the caller may mint. That is `share:create` on **this very scope**, asked by the
   * handler before this is reached, for the reason the handler states: a caller with no authority here must
   * not be able to make this API write to the other product on the strength of a string it supplied.
   */
  async mint(
    scope: SeatScope,
    role: EpicBinding['role'],
    product: ProjectRef['product'],
  ): Promise<PreparedBinding> {
    const seat = await this.#seats.create(
      { product, projectId: scope.projectId },
      { name: MINTED_SEAT_NAME, role, scope, createdBy: null },
    )
    return this.prepare(seat.token, role)
  }

  /** Resolves a pasted token, checks it carries the role asked for, and seals it. */
  async prepare(token: string, role: EpicBinding['role']): Promise<PreparedBinding> {
    const live = await this.#live(token)
    if (live === null) return { ok: false, reason: 'unknown' }
    if (effectiveBridgeRole(live.role, role) !== role) return { ok: false, reason: 'weaker' }
    return { ok: true, binding: { projectId: live.projectId, role, sealedToken: seal(this.#secret, token) } }
  }

  async #live(token: string): Promise<{ readonly projectId: string; readonly role: Role } | null> {
    const principal = await this.#bearers.resolve(token)
    if (principal === null || principal.kind !== 'link') return null
    if (principal.scope.kind !== 'project') return null
    return { projectId: principal.scope.projectId, role: principal.role }
  }
}
