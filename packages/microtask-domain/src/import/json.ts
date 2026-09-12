/**
 * Narrows a value to a JSON object, which is the question every raw read in this directory opens
 * with.
 *
 * Lifted here when `checks.ts` wanted a third copy. Redefining a two-line guard per file is this
 * repo's idiom — `api-error.ts`, `principal.ts` and `document-facts.test.ts` each hold their own —
 * and the two copies in `sniff.ts` and `legacy.ts` were left alone for exactly that reason. Three
 * is a different thing, because these three read the **same bytes**: one harvested `project.json`
 * passes through classification, conversion and the preview's checks in turn, so a divergence
 * between the copies would show up as one module classifying a file the next one cannot read.
 *
 * Not exported from the package's `index.ts`. It is an internal of `src/import/`, and `apps/api`
 * has no use for it — the modules that do are in the same directory.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The members of a raw JSON array, or none at all when the value is not one.
 *
 * Every collection the preview's checks read off an unvalidated manifest — `folders`, `tasks`,
 * `shareLinks`, a document's `tabs` — arrives as `unknown`, and a hand-edited file is as likely to
 * carry `null` there as an array. Answering with an empty list rather than a throw is what lets a
 * check report what it found: the schema-conformance check has already said the collection is
 * missing, and a second module crashing on the same file would cost the other nine directories in
 * the drop their preview rows.
 */
export const members = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])
