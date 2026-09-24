import { PlanShareView } from '@repo/contracts'
import { epicsApi, type EpicsApi } from './operations/epics.js'
import { featuresApi, type FeaturesApi } from './operations/features.js'
import { itemsApi, type ItemsApi } from './operations/items.js'
import { plansApi, type PlansApi } from './operations/plans.js'
import { MACROPLAN_CURRENT_SHARE_PATH } from './paths.js'
import type { Transport } from './transport.js'
import type { Decoded } from './types.js'

/**
 * Every operation the Macroplan API serves, and the **same** set for both client kinds.
 *
 * A sibling of {@link MicrotaskApi} rather than a widening of it. ADR 0014 puts the product
 * dimension into the path, the data directory and the domain packages while nothing depends on it,
 * and the client layer is the last place that seam was missing: every root in `paths.ts` but the
 * product-agnostic `/v1/auth` names one product, so one client carrying both would have to be told
 * which. Keeping them apart means a page holding this one cannot reach a project at all.
 *
 * The two clients built from it differ by brand and by nothing else, for the reason
 * {@link MicrotaskApi} gives — which calls a credential may actually make is the API's decision, on
 * a target built from the request's own parameters, and a client that omitted one would be a second
 * copy of that policy. A call outside a seat's plan comes back as {@link ApiError} with `status` 403.
 */
export interface MacroplanApi {
  /** Plans: the collection, one plan with its schedule, and one item with its description. */
  readonly plans: PlansApi

  /**
   * Epics: the rails of one plan, added, renamed, reordered and removed.
   *
   * Every one of them answers the whole plan, because a structural edit can move every bar on the
   * canvas — so the authoritative timeline arrives in the same round trip as the write.
   */
  readonly epics: EpicsApi

  /**
   * Features: what sits on the rails, added, edited, moved, re-pointed and removed.
   *
   * `setDependencies` is the one member here that is not the edit its name suggests: it replaces a
   * feature's whole edge list, because that is the only shape the API offers. Read its TSDoc before
   * wiring it to anything that adds a single edge.
   */
  readonly features: FeaturesApi

  /**
   * Items: what sits inside a feature, added, edited, moved, described and removed.
   *
   * `describe` replaces a whole description and the API truncates one over its byte cap rather than
   * refusing it, answering 200 either way. Read its TSDoc before wiring it to a text field.
   */
  readonly items: ItemsApi

  /**
   * Describes the plan seat the caller presented, and the plan it opens.
   *
   * It sends no token in the path and none in a header of its own — the answer is derived from the
   * bearer the transport already carries, which is what keeps a credential out of server logs and
   * out of the `Referer` of every link the page then renders (ADR 0013). It is the call a share-link
   * landing will have to make first: a seat holder knows its token and nothing else, and `scope` and
   * `plan` here are what name the plan it may then read. An **admin** token names no seat, so this
   * answers 404 for one: not a refusal, simply nothing to describe.
   */
  currentShare(): Promise<Decoded<typeof PlanShareView>>
}

/** Binds every Macroplan operation group to one transport, which is what a client is made of. */
export function createMacroplanSurface(transport: Transport): MacroplanApi {
  return {
    plans: plansApi(transport),
    epics: epicsApi(transport),
    features: featuresApi(transport),
    items: itemsApi(transport),
    currentShare: () =>
      transport.json({ method: 'GET', path: MACROPLAN_CURRENT_SHARE_PATH }, PlanShareView),
  }
}
