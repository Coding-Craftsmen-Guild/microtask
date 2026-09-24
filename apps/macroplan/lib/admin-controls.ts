import type { PlanControls } from './plan-capabilities'

type Drawn<Controls> = {
  readonly [Name in keyof Controls]: Controls[Name] extends boolean ? true : Drawn<Controls[Name]>
}

/**
 * Every control there is, drawn: what the admin surface passes where a seat passes
 * `planCapabilities`.
 *
 * The admin is **not a role**, so there is nothing to pass through the projection. `can()` answers
 * `true` on `principal.kind === 'admin'` before any scope, grant list or target is consulted
 * (`packages/kernel/src/access/policy.ts`), and an admin holds no scope at all — a page rendering
 * for one is rendering for every plan. A synthetic fourth role invented to feed
 * `planCapabilities` would need a scope to be asked about, and deciding what that scope
 * answered would be a second policy living in a client, disagreeing with the kernel the first time
 * either changed. `apps/microtask/components/shared/admin-capabilities.ts` is the same decision, one
 * layer down: it hands components the record rather than a role, so every component reads one shape
 * whichever principal is rendering (ADR 0038).
 *
 * **It cannot fall behind {@link PlanControls}, and the compiler is what guarantees it.** `Drawn`
 * maps over `keyof`, recursing into a group rather than stopping at it, so this constant's declared
 * type is "every boolean this interface holds at any depth, and each one `true`". A control added to
 * either group — or a third group added beside them — makes the literal below fail with a missing
 * property rather than defaulting to `false`, and a member written `false` fails too because `true`
 * is the only value the type admits. Neither a `satisfies` nor a `Record` of the names would do
 * both: the first accepts `false`, and the second cannot carry the per-control TSDoc the interfaces
 * do. `admin-controls.test.ts` sweeps the same two facts at runtime, for a reader who wants to see
 * them asserted rather than inferred.
 *
 * It is not built with `Object.fromEntries` over a list of names, as Microtask's record is: there is
 * no list of control names to drive it — the names live in `PlanContentControls` and
 * `PlanSeatControls` as documented members — and `fromEntries` answers a bare index signature,
 * so that shape would need the type assertion this app's lint regime forbids in shipped source.
 *
 * Like every control, each of these answers a rendering question and never a gate. The admin's
 * authority is the API's answer to `mp_admin`, and this constant adds nothing to it: a control drawn
 * here for a plan the API has since refused still meets that refusal on click.
 */
export const ADMIN_CONTROLS: Drawn<PlanControls> = {
  content: {
    createEpic: true,
    renameEpic: true,
    recolourEpic: true,
    reorderEpic: true,
    removeEpic: true,
    createFeature: true,
    renameFeature: true,
    estimateFeature: true,
    pinFeature: true,
    placeFeature: true,
    setDependencies: true,
    removeFeature: true,
    createItem: true,
    renameItem: true,
    estimateItem: true,
    describeItem: true,
    placeItem: true,
    removeItem: true,
  },
  seats: {
    read: true,
    create: true,
    update: true,
    revoke: true,
  },
}
