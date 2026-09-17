import type { z } from '@hono/zod-openapi'
import type { ImportPreview } from '@repo/contracts'
import { planImport } from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { importTarget } from './apply.js'
import { readStagedFiles } from './session-files.js'

/**
 * The 200 body as the declared component types it.
 *
 * `z.infer` of the schema rather than a shape written out again, so this cannot describe a body
 * the document does not. It exists for the one variance gap `ExportBundleBody` names: every value
 * `@repo/microtask-domain` builds is readonly to its leaves, a schema's inferred nested arrays are
 * not, and the two are the same JSON.
 *
 * What holds the two shapes together is not this alias, and it is **not** the response-shape walk
 * either: that walk compares the body's **top-level** keys, which for this component are `groups`
 * and `sessionId`, so it never reaches a row and never reaches a row's share link. Below the
 * envelope the check is `plan.test.ts`'s field-for-field comparison, which parses a row against
 * `ImportPreviewGroup` **and each of its links against `ImportPreviewShareLink`** and asserts each
 * parse handed back every key it was given — the same nested-drift comparison `ExportBundleBody`
 * describes, and for the same reason: zod strips an unknown nested key in silence.
 */
export type ImportPreviewBody = z.infer<typeof ImportPreview>

/**
 * Describes what one staged session would do, and **writes nothing** (design §7.3).
 *
 * Every row comes from `planImport`, which the confirm runs again inside the lock it holds. So
 * this is a description and not a promise: it takes no lock — a read holding the process-wide
 * write queue would stall every client for the length of an admin's deliberation — and the two
 * checks that read the target store, token uniqueness and `projectsPerProduct`, are re-measured
 * where the write happens.
 *
 * The rows are passed through rather than copied field by field, which is what keeps a share
 * **token** out of a preview. `PreviewRow` has nowhere for one to sit and neither does
 * `ImportPreviewShareLink`, so the disclosure ADR 0033 exists to close is refused by the type
 * rather than by a mapper somebody has to keep correct — a preview is rendered into an admin page
 * and therefore into the Flight payload and the HTML, and a bundle may carry fifty links per
 * project.
 *
 * A type is not evidence about the bytes, so two tests measure them rather than it, and neither is
 * the response-shape walk — that walk reads top-level keys and stops at `groups`.
 * `plan.test.ts` compares each row **and each of its links** pre-parse to post-parse, and
 * `import-confirm.test.ts` stages a manifest carrying a real token, GETs this address, and scans
 * the serialised body for it. The second is at this address on purpose: the domain check would
 * still pass if a token re-entered the body anywhere between `planImport` and the wire.
 *
 * @throws NotFound when the session id names nothing — expired, swept, or never opened.
 * @throws Invalid naming which rule a harvested path broke.
 */
export async function previewImport(
  deps: ApiDeps,
  sessionId: string,
): Promise<ImportPreviewBody> {
  const files = await readStagedFiles(deps, sessionId)
  const planned = planImport(files, await importTarget(deps), deps)
  return { sessionId, groups: planned.map((one) => one.row) } as ImportPreviewBody
}
