import { createRoute, z } from '@hono/zod-openapi'
import { SearchResults } from '@repo/contracts'
import { LIMITS } from '@repo/microtask-domain'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'

/**
 * The term to match, bounded by the longest name there could be.
 *
 * Declared here rather than in `@repo/contracts` because a query schema is expanded into
 * parameters rather than referenced as a component, and every schema that package exports is
 * required to carry a component id. The bound comes from the domain's own name cap rather than
 * from a number written twice: a term longer than any name could be matches nothing, so
 * refusing it costs a caller nothing and stops a long string reaching the scan.
 *
 * Required, and bounded above but not below. A term that reduces to nothing — empty, or only
 * whitespace — is a well-formed question with no answer, and the service returns no rows for it
 * rather than treating the empty substring as a match on every name. Refusing the empty string
 * here while accepting a single space would make those two spellings of the same question
 * answer differently, so the length floor lives nowhere: a search with no `q` at all is a client
 * defect and is refused, a search for nothing finds nothing.
 */
export const searchQuery = z.object({
  q: z
    .string()
    .max(LIMITS.nameLength)
    .meta({ description: 'The term to match names against, case-insensitively' }),
})

/**
 * Search every name this caller may be told, across the whole product.
 *
 * The gate asks a different question of each principal kind, because "search across everything"
 * is admin authority and a link holder is not asking it — it is asking to search the one thing
 * it already holds. Gating the route on `workspace:search` for everybody would refuse every link
 * principal outright and leave the per-principal filtering underneath it unreachable (ADR 0009).
 *
 * What the caller receives is filtered a second time, per row, inside the service. That is
 * defence in depth rather than the gate repeated: the gate decides whether the question may be
 * asked at all, and the filter decides which of the names it found may be spoken aloud.
 */
export const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  tags: ['search'],
  summary: 'Search names across the product',
  description:
    'Matches project, folder and task names. Tab names and document text are not searched (ADR 0021).',
  security: GUARDED_SECURITY,
  request: { query: searchQuery },
  responses: {
    200: {
      description: 'Every matching name the caller may be told, in project order',
      content: { 'application/json': { schema: SearchResults } },
    },
    ...problemResponses(),
  },
})
