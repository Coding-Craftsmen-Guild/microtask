import {
  PlanView,
  type CreateFeaturePayload,
  type DependenciesPayload,
  type FeaturePlacementPayload,
  type UpdateFeaturePayload,
} from '@repo/contracts'
import { planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'
import type { Plan } from './plans.js'

const featuresPath = (planId: string): string => `${planPath(planId)}/features`

const featurePath = (planId: string, featureId: string): string =>
  `${featuresPath(planId)}/${encodeURIComponent(featureId)}`

/**
 * The feature to add: the rail it belongs to, its name, and optionally an estimate and a pin.
 *
 * `epicId` is a field of the body rather than a path segment, and a rail that is not in this plan is
 * refused as a **422** rather than a 404 — the thing being addressed is the plan, and ADR 0050 is
 * why a reference across plans is refused instead of followed.
 */
export type NewFeature = Decoded<typeof CreateFeaturePayload>

/**
 * What may be changed about a feature that already exists: its name, its estimate, its pin.
 *
 * `null` and omission differ on `estimateDays` and `pinSprint`: leaving a key off leaves the value
 * alone, sending `null` clears it. Zero is a real estimate and sprint zero is a real pin, so
 * neither "not estimated" nor "not pinned" has a falsy spelling.
 *
 * Not `epicId`. Moving a feature is {@link FeaturesApi.place}, and `UpdateFeaturePayload` declares
 * no such field, so a body naming one has it stripped by the API rather than honoured.
 */
export type FeatureChange = Decoded<typeof UpdateFeaturePayload>

/**
 * Which rail a feature sits on and where on it — both, always, even when only one is changing.
 *
 * The payload object rather than two bare arguments, because the wire shape is `{epicId, position}`
 * and this client speaks the wire. Neither key is optional, so moving a feature along the rail it is
 * already on means naming that rail again.
 */
export type FeaturePlacement = Decoded<typeof FeaturePlacementPayload>

/**
 * Everything a caller may ask of the features on a plan's rails.
 *
 * This is the group the role line cuts through, so a 403 is an ordinary outcome of half of it rather
 * than a misconfiguration: some `feature:` actions are granted to `write` and some only to `manage`.
 * `packages/kernel/src/access/policy.ts` holds which is which, and it is named here once instead of
 * per member — the table copied into five doc blocks is five copies to find when a grant moves, and
 * the member that gets missed is the one that stops being a warning and starts being a lie.
 */
export interface FeaturesApi {
  /** Adds a feature at the end of the rail the body names; the body carries no position. */
  create(planId: string, feature: NewFeature): Promise<Plan>

  /**
   * Renames one feature, re-estimates it, re-pins it, or any combination, moving it nowhere.
   *
   * **A body carrying two of the three fields is authorised against two gates, and a refusal of
   * either writes neither.** The handler asks for what the body's present keys imply: a `name`
   * needs `feature:rename`, an `estimateDays` needs `feature:estimate` — both held by `write` — and
   * a `pinSprint` needs `feature:pin`, which only `manage` holds. Every gate runs before the store
   * is reached and the first refusal throws, so a `write` seat sending a rename and a pin together
   * gets a 403 and keeps the old name as well as the old pin. Which edit was refused is still
   * legible: `apps/api/src/auth/authorize.ts` words every 403 as `Not permitted: <action>` and the
   * problem document carries that string as its `detail`, so `ApiError.detail` names it. It names
   * the first refusal and no other, the branch order above being fixed. So the reason to send one
   * field per request is the sentence in bold above — the permitted half lands only when it travels
   * alone — and not any difficulty in reading back which gate closed.
   *
   * The API refuses an empty body, so a call asking for nothing is a 422 rather than a write that
   * stamps `updatedAt` and changes nothing.
   */
  update(planId: string, featureId: string, change: FeatureChange): Promise<Plan>

  /**
   * Moves one feature along its rail or onto another, renumbering both rails densely.
   *
   * The feature crosses whole — its estimate, its pin and its edges are none of them properties of
   * the rail it sat on — and nothing is rewritten to keep a dependency satisfied. A feature dragged
   * ahead of something it waits on is a contradiction the forward pass reports in the response's
   * `schedule.ignoredEdges`, not a 409: repairing it here would be the silent solver spec §6
   * refuses, so the caller renders the contradiction rather than being protected from it.
   */
  place(planId: string, featureId: string, to: FeaturePlacement): Promise<Plan>

  /**
   * **Replaces** the whole set of features this one waits on. Not an add, and not a remove.
   *
   * There is no add/remove pair to reach for: `PUT .../dependencies` with `DependenciesPayload`
   * (`{dependsOn}`) is the only edge route in the contracts. So adding one edge means reading the
   * feature's current `dependsOn` out of a plan, appending to it, and sending all of it back — and
   * the known consequence is a lost update: two callers editing one feature's edges from the same
   * starting plan each send a complete list, the second overwrites the first, and **neither is
   * told**. Nothing on this route detects it, because the route takes no `If-Match`;
   * `tabs.ts`'s `writeDocument` is the repository's one conditional write, and its `If-Match`
   * header carrying the value the caller last read is the shape a later phase would add here if
   * concurrent edge editing turns out to be real. Until then a caller that cares re-reads the plan
   * this call answers with, rather than trusting the list it sent.
   *
   * A cycle is a **409**, a problem status beyond the common set that
   * `apps/api/src/routes/macroplan/features/routes.ts` declares and gives its reason for, and its
   * `detail` names the features that would wait on each other. Nothing is written: every check runs
   * before the first store call. A self-edge and an id naming a feature in another plan are both 422
   * instead, the distinction {@link NewFeature} draws on its `epicId`.
   *
   * The edge budget refuses twice, from two layers. `DependenciesPayload` caps this list on its own
   * at `LIMITS.edgesPerPlan`, so a longer one is a schema 422 before a store is opened; and the
   * domain then counts the **whole plan** rather than one feature, so a list well inside that same
   * bound is still refused by the edges every other feature already holds. A caller that sizes its
   * list against the constant has only cleared the first of the two.
   *
   * Takes the ids rather than a `{dependsOn}` object, unlike {@link FeaturesApi.place}: the body
   * has exactly one field, so the wrapper would be ceremony at every call site. `folders.ts` takes
   * a bare `name` where its body is `{name}` for the same reason. The type is read off
   * `DependenciesPayload` rather than written out as `readonly string[]`, so renaming that field in
   * the contract is a compile error here — nothing else would catch it, because the route test
   * asserts what this client sends and would stay green while the API stripped the body to `{}`.
   */
  setDependencies(
    planId: string,
    featureId: string,
    dependsOn: Decoded<typeof DependenciesPayload>['dependsOn'],
  ): Promise<Plan>

  /**
   * Removes one feature, the items under it and every edge that named it, in one write.
   *
   * The edge strip runs across every rail, because an edge pointing at a feature that no longer
   * exists is one the pass drops silently — after which a bar is placed as though the dependency
   * had never been stated. Like every structural route it answers the **plan that remains** rather
   * than `void`, for the reason {@link Plan} records.
   */
  remove(planId: string, featureId: string): Promise<Plan>
}

/** Binds the feature operations to a transport. */
export function featuresApi(transport: Transport): FeaturesApi {
  return {
    create: (planId, feature) =>
      transport.json({ method: 'POST', path: featuresPath(planId), body: feature }, PlanView),
    update: (planId, featureId, change) =>
      transport.json(
        { method: 'PATCH', path: featurePath(planId, featureId), body: change },
        PlanView,
      ),
    place: (planId, featureId, to) =>
      transport.json(
        { method: 'PATCH', path: `${featurePath(planId, featureId)}/placement`, body: to },
        PlanView,
      ),
    setDependencies: (planId, featureId, dependsOn) =>
      transport.json(
        { method: 'PUT', path: `${featurePath(planId, featureId)}/dependencies`, body: { dependsOn } },
        PlanView,
      ),
    remove: (planId, featureId) =>
      transport.json({ method: 'DELETE', path: featurePath(planId, featureId) }, PlanView),
  }
}
