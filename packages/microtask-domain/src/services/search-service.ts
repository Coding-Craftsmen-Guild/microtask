import type { Principal, Product } from '@repo/kernel'
import type { ServiceContext } from './context.js'
import { candidates, matches, normalise, visibleTo } from './search-mapper.js'
import type { SearchResult } from './search-mapper.js'

export type { SearchResult } from './search-mapper.js'

/**
 * Cross-project search over names, shaped for whoever is asking.
 *
 * Two decisions meet here. Search matches names only, so it reads one manifest per project and
 * never opens a task file — the cost ADR 0005's split was designed to keep flat, and the reason
 * document text and tab names are outside its reach (ADR 0021). And the result set is filtered
 * per principal where the rows are, because handing an unfiltered set to a caller that then
 * narrows it is the leak ADR 0009 exists to prevent.
 *
 * The filter is not a gate. Whether a request may run at all is decided once, in the API; this
 * decides only which of the rows it found may be spoken aloud.
 */
export class SearchService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /**
   * Every name matching the query that this principal may be told, in project order.
   *
   * Takes a bare product rather than a ref, because there is no one project to name. Takes no
   * lock either: nothing here writes, so a search answers while a writer holds the queue rather
   * than waiting behind it.
   *
   * An empty query returns nothing rather than everything. That is the deliberate reading of an
   * unfilled search box, and it also keeps the empty term — a substring of every name — from
   * turning a filter into a listing of the workspace.
   */
  async search(
    product: Product,
    principal: Principal,
    query: string,
  ): Promise<readonly SearchResult[]> {
    const needle = normalise(query)
    if (needle === '') return []
    const manifests = await this.#ctx.store.listManifests(product)
    return manifests.flatMap((manifest) =>
      candidates(manifest).filter(
        (result) => matches(result.name, needle) && visibleTo(principal, result),
      ),
    )
  }
}
