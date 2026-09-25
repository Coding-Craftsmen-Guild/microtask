import { effectiveBridgeRole, seal, type Role } from '@repo/kernel'
import type { EpicBinding } from '@repo/macroplan-domain'
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

/** What {@link Bindings} needs: the sealing secret, and the resolver that says what a token names. */
export interface BindingsOptions {
  readonly secret: string
  readonly bearers: Bearers
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

  /** Creates the minter over its secret and its resolver. */
  constructor(options: BindingsOptions) {
    this.#secret = options.secret
    this.#bearers = options.bearers
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
