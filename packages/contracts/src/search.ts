import { z } from 'zod'
import { EntityId, EntityName } from './document.js'

/**
 * One name a search matched, and enough of an address to fetch what it named.
 *
 * Every variant carries the same three kinds of field and nothing else: what it is, where it
 * lives, and what it is called. A task result names no folder and no breadcrumb, because the
 * name of the folder holding a task is itself a disclosure a task-scoped link must not receive
 * (ADR 0011) — so every principal is handed the same shape, and a widening cannot arrive later
 * as an extra field nobody thought to filter.
 *
 * Search reads names only. Tab names and document text are outside its reach, which is what
 * keeps a cross-project query to one file read per project (ADR 0021).
 */
export const SearchResult = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('project'), projectId: EntityId, name: EntityName }),
    z.object({
      kind: z.literal('folder'),
      projectId: EntityId,
      folderId: EntityId,
      name: EntityName,
    }),
    z.object({ kind: z.literal('task'), projectId: EntityId, taskId: EntityId, name: EntityName }),
  ])
  .meta({ id: 'SearchResult', description: 'One matched name, and where to find it' })

/** Every name a query matched that the caller may be told, in project order. */
export const SearchResults = z
  .object({ results: z.array(SearchResult).readonly() })
  .meta({ id: 'SearchResults', description: 'What a search matched, shaped for whoever asked' })
