import type {
  EpicService,
  FeatureService,
  ItemService,
  PlanService,
  PlanShareLinkService,
} from '@repo/macroplan-domain'

/**
 * The five services this product's routes are mounted over.
 *
 * A record rather than five parameters, because `createPlanScoped` would otherwise take more
 * arguments than ADR 0027's cap allows and every subtree added later would push it further. Naming
 * them also means a subtree app is handed only the service it needs: the epics app never sees
 * `FeatureService`, so it cannot start editing features from an epic route. `seats` is the sharpest
 * case — only the `share-links` app receives it, so no structural route can mint a credential.
 *
 * `plans` is the one member reached from both mounts: the plan-scoped routes read and write it, and
 * `/shares/current` above them answers from the plan its caller's own scope names.
 *
 * It is an interface and nothing else — no construction here. The `PlanContext` these are built from
 * is assembled in `index.ts` and nowhere else, because that is the one seam that tells the two
 * domains' stores apart (`deps.store` is Microtask's, `deps.plans` is this product's), and a subtree
 * module that built its own service would be a second place that decision could be made differently.
 */
export interface PlanServices {
  readonly plans: PlanService
  readonly epics: EpicService
  readonly features: FeatureService
  readonly items: ItemService
  readonly seats: PlanShareLinkService
}
