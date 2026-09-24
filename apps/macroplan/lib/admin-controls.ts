import type { PlanControls } from './plan-capabilities'

type Drawn<Controls> = {
  readonly [Name in keyof Controls]-?: NonNullable<Controls[Name]> extends boolean
    ? true
    : NonNullable<Controls[Name]> extends object
      ? Drawn<NonNullable<Controls[Name]>>
      : never
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
 * The three pieces of `Drawn` that look like noise each close a hole the plain mapped type had, and
 * each was compiled before it was written here. `-?` strips optionality, because a homomorphic mapped
 * type **preserves** it: an optional `boolean` member maps to `true | undefined`, which a literal may
 * both omit and write `false` into even under `exactOptionalPropertyTypes`. `NonNullable` is what the
 * conditional's subject is wrapped in, so it sees `boolean` rather than `boolean | undefined` and
 * reaches the `true` branch at all. And the `extends object` arm sends anything that is neither a
 * boolean nor a group to `never`, because a homomorphic mapped type over a primitive answers that
 * primitive unchanged — so a `string` member would have passed straight through as a `string`, and the
 * sentence above would have been false of it. None of the three matters for today's
 * {@link PlanControls}, which holds no optional and no non-boolean member. All three are what make
 * that a property the compiler keeps rather than one the next member has to be noticed by.
 *
 * It is written out rather than derived, which is the one place this file differs from Microtask's
 * answer to the same question. `apps/microtask/components/task-tree/controls.ts` keeps no admin
 * literal at all: it pushes `ADMIN_CAPABILITIES` — an all-true `Capabilities` record — through the
 * same `treeControls` projection a share link's controls come out of, so its admin row cannot
 * disagree with a seat's. The equivalent here would be an all-true `Capabilities` pushed through
 * `planCapabilities`, and there is nothing to push it with: `@repo/contracts` exports
 * `CAPABILITY_ACTIONS` and `capabilities()` and **no** all-true record, `planCapabilities` asks for a
 * role and a scope rather than a record, and building the record in this app means
 * `Object.fromEntries`, which answers a bare index signature and so needs the type assertion
 * `admin-capabilities.ts` itself writes (`as Capabilities`). Lint does not forbid that assertion —
 * nothing in `packages/eslint-config` bans one, and that sibling ships under this very config — it is
 * a **convention** this app keeps, and keeping it is what leaves the literal below as the honest
 * choice. Adding an all-true export to `@repo/contracts` is a decision recorded for later rather than
 * one this file makes.
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
