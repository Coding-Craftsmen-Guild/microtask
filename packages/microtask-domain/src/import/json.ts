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
