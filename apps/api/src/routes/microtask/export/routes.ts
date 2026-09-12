import { createRoute, z } from '@hono/zod-openapi'
import { ExportBundle } from '@repo/contracts'
import { TOKEN_DISPOSITIONS } from '@repo/microtask-domain'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { projectParams } from '../../params.js'

/**
 * What the export should do with the share tokens it copies, defaulting to omitting them.
 *
 * Declared here rather than in `@repo/contracts` for the reason the search term is: a query
 * schema is expanded into parameters rather than referenced as a component, and every schema that
 * package exports is required to carry a component id. The two values come from the domain's own
 * list, so the set the API accepts and the set the bundler handles cannot drift apart.
 *
 * **The default is `strip`, and that is the whole of the decision.** A download that omits the
 * tokens is a file an operator can mail to themselves; one that carries them is a file holding
 * every live credential in the workspace. Nothing in a response would look wrong if these were
 * the other way round, so the safe disposition is the one a caller gets by naming nothing, and
 * asking for the other is explicit, spelled out in the query string, and admin-only (see
 * `handlers.ts`). A value this enum does not list is a 422 rather than a fallback to either.
 */
export const exportQuery = z.object({
  tokens: z
    .enum(TOKEN_DISPOSITIONS)
    .default('strip')
    .meta({ description: 'Omit every share link, or carry the links with their live tokens' }),
})

const BUNDLE_RESPONSE = {
  description: 'The bundle, with a document for every task each project names',
  content: { 'application/json': { schema: ExportBundle } },
}

/**
 * The 200 body as the declared component types it.
 *
 * `z.infer` of the schema itself rather than a shape written out again, so this cannot describe a
 * body the document does not. It exists for one variance gap and nothing else: every value
 * `@repo/microtask-domain` builds is readonly to its leaves, while a schema's inferred arrays are
 * mutable, and the two are the same JSON. The **view** schemas in `@repo/contracts` close that gap
 * with `.readonly()`, which is why no other handler states anything — but a bundle schema is also
 * *parsed*, by the import path, and zod 4 freezes what a readonly schema parses, so marking the
 * file format readonly to please a serialiser would change what import reads.
 *
 * Bridging that variance is **all** the conversion does, and it is not what holds the two shapes
 * together. That is `ExportedBundle`'s type-level agreement with this schema, asserted where the
 * bundler lives, plus the response-shape walk parsing a real body against this component and
 * comparing its keys against what the component describes. A field added to one and not the other
 * fails one of those, not this.
 */
export type ExportBundleBody = z.infer<typeof ExportBundle>

const UNREADABLE =
  'A task file that will not read is a 409 naming the project and the task, rather than a bundle that has quietly lost it.'

/**
 * Export every project in this product.
 *
 * Admin-only through `workspace:list-projects`, for the reason the projects collection is: a
 * route whose address names no project has no per-resource target to decide on, so ADR 0009
 * reserves it rather than answering a link holder a filtered workspace. A seat that wants its own
 * project exported has the project-scoped address below.
 *
 * 409 is declared beyond the common set. An entry whose task document will not read cannot be
 * skipped — `ExportedProject` refines one document per manifest entry, so a bundle missing one
 * fails the schema this route declares — and cannot be dropped either, which would lose a task
 * on the one path a migration runs through. A 404 would be the wrong word at this address: it
 * reads as "no such route" about a collection that plainly exists.
 */
export const workspaceExportRoute = createRoute({
  method: 'get',
  path: '/export',
  tags: ['export'],
  summary: 'Export every project in this product',
  description: `Every project, each with a document for every task it names. ${UNREADABLE}`,
  security: GUARDED_SECURITY,
  request: { query: exportQuery },
  responses: { 200: BUNDLE_RESPONSE, ...problemResponses([409]) },
})

/**
 * Export one project, in the same envelope a whole workspace comes in.
 *
 * Gated on `export:run` against this project, which `manage` holds and `write` does not. A
 * task-scoped holder is refused however it asks: `export:run` is decided against a project target
 * and a task scope reaches only `project:read`, so a bundle filtered down to one task is not
 * something the policy offers — matching `share:read`, `share:revoke` and `share:update`.
 *
 * `projectParams` is redeclared rather than inherited from the mount path, because a parameter
 * that exists only on a parent's path is not emitted into the document and has no validated value
 * to build the authorization target from.
 *
 * Two 4xx-shaped failures live here and mean different things: a `projectId` naming nothing is the
 * 404, and a task file that will not read is the 409. An operator has to act on them completely
 * differently, which is why they are not the same status.
 */
export const projectExportRoute = createRoute({
  method: 'get',
  path: '/export',
  tags: ['export'],
  summary: 'Export one project',
  description: `This project, with a document for every task it names. ${UNREADABLE}`,
  security: GUARDED_SECURITY,
  request: { params: projectParams, query: exportQuery },
  responses: { 200: BUNDLE_RESPONSE, ...problemResponses([409]) },
})
