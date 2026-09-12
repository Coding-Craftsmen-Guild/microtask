import { ProjectManifest, TaskDocument } from '@repo/contracts'
import type { ProjectManifest as Manifest } from '../entities/manifest.js'
import type { TaskDocument as Document } from '../entities/task.js'
import { convertBundledProject, type ConvertedProject } from './legacy.js'
import { located, quotedPath } from './refusal.js'

interface Parsed<T> {
  readonly reasons: readonly string[]
  readonly data: T | null
}

/**
 * One task document as a drop carried it, under the id whatever carried it named it by.
 *
 * `id` is that name and **not** the document's own: a v2 project directory names a task file
 * `tasks/<id>.json`, which is the set the manifest is cross-checked against (ADR 0018), while a
 * bundle embeds its documents and names them only by the `id` inside each one — so a bundled
 * document arrives as `null` and is cross-checked against itself. Keeping the two apart is what
 * lets {@link crossCheckReasons} refuse the one case a set comparison cannot see: a file named for
 * a task the manifest does name, holding the document of a different one.
 *
 * `path` is where it came from, and it is the only thing a schema failure can name — a bundle's
 * documents have no path of their own, so a caller exploding a bundle into projects gives each
 * document a label it can be found by.
 */
export interface DroppedDocument {
  readonly id: string | null
  readonly path: string
  readonly json: unknown
}

/**
 * One project a drop carried, in whichever of the two states it reaches the checks in.
 *
 * `shape` names **conversion state and not provenance**, which is the distinction that actually
 * decides what happens below: `raw` is a manifest and documents nobody has validated, `converted`
 * is a project already in the shape this repo stores. Naming the members after where they came
 * from — `v2` and `legacy` — would read fine today and mislead the moment a *reminted* v2 project
 * is re-checked (Task 5, and the confirm's second pass), because such a project is converted and
 * would have to be labelled `legacy` to be accepted.
 *
 * Two members and not `ImportShape`'s four. The three v2 shapes differ in how a *group* is laid out
 * and not at all in what has to happen to it here, so a caller explodes a `v2-workspace-bundle`
 * into one of these per project — which is also what `ImportPreview` requires, a project id being
 * claimable by at most one group.
 *
 * A legacy file arrives **already converted**, and that asymmetry is the ordering rule Task 3
 * settled rather than an oversight. `convertBundledProject` requires input a schema has already
 * passed, so schema-check-then-convert is this module's to own and not a caller's to remember;
 * `convertLegacyProject` is total over `unknown`, so there is no order to get wrong there and
 * nothing gained by moving it in here — it needs a clock and an id generator, and this stays free
 * of both.
 */
export type DroppedProject =
  | {
      readonly shape: 'raw'
      readonly path: string
      readonly manifest: unknown
      readonly documents: readonly DroppedDocument[]
    }
  | {
      readonly shape: 'converted'
      readonly path: string
      readonly converted: ConvertedProject
    }

/**
 * One project after the drop-set checks have run: what they found, and what it converts to.
 *
 * `converted` is `null` exactly when a v2 manifest or one of its documents failed its schema, which
 * is the whole reason schema conformance runs first — the converter would throw on such input and
 * end an upload that has nine other directories left to describe.
 */
export interface Prepared {
  readonly drop: DroppedProject
  readonly reasons: readonly string[]
  readonly converted: ConvertedProject | null
  readonly named: readonly (string | null)[]
}

function asManifest(path: string, json: unknown): Parsed<Manifest> {
  const parsed = ProjectManifest.safeParse(json)
  if (parsed.success) return { reasons: [], data: parsed.data }
  const where = located(parsed.error.issues)
  return { reasons: [`${quotedPath(path)} is not a project manifest: ${where}`], data: null }
}

function asDocument(path: string, json: unknown): Parsed<Document> {
  const parsed = TaskDocument.safeParse(json)
  if (parsed.success) return { reasons: [], data: parsed.data }
  const where = located(parsed.error.issues)
  return { reasons: [`${quotedPath(path)} is not a task document: ${where}`], data: null }
}

/**
 * Runs the schema conformance the rest of the preview depends on, then converts what passed it.
 *
 * It runs **first** so everything downstream reads a project of known shape, and it gates the
 * conversion rather than merely preceding it: `convertBundledProject` reads `folders`, `tasks` and
 * `tabs` directly and throws a bare `TypeError` when one is absent (Task 3), so a manifest nobody
 * has checked would end an upload that has nine other directories left to describe.
 *
 * There is deliberately **no name bound here** — see the amendment dated 2026-09-12 on the plan's
 * collection-bounds criterion. Every name is either repaired or already refused: `cleanName` caps
 * the project, folder, task and tab names in both converters, `ShareLink.name` bounds the one name
 * they leave alone, and an over-long raw name fails `ProjectManifest` below. A bound of its own
 * could therefore only *disagree* with them, and it did: measured on the raw value it refused
 * `" " + 80 characters + " "`, which `EntityName` accepts — it trims first — and which `cleanName`
 * writes as a clean 80-character name. Measuring the trimmed value instead only moves the false
 * refusal to the 200-character name `cleanName` truncates rather than rejects.
 *
 * A legacy project is schema-checked on the **converted** manifest, that being the only manifest a
 * legacy file has. That is the one thing anywhere in the preview that refuses a `position` which is
 * not a number: `convertLegacyProject` deliberately carries such a value through as `NaN`, which
 * `JSON.stringify` writes as `null`, and a manifest holding `"position": null` is one the client
 * refuses — taking the whole projects index with it, because `ProjectList` is a single array parsed
 * as a whole.
 */
export function prepareDrop(drop: DroppedProject): Prepared {
  if (drop.shape === 'converted') {
    const { manifest, documents } = drop.converted
    const reasons = [
      ...asManifest(drop.path, manifest).reasons,
      ...documents.flatMap((one) => asDocument(`${drop.path} task ${one.id}`, one).reasons),
    ]
    return { drop, reasons, converted: drop.converted, named: documents.map(() => null) }
  }
  const manifest = asManifest(drop.path, drop.manifest)
  const parsed = drop.documents.map((one) => asDocument(one.path, one.json))
  const reasons = [...manifest.reasons, ...parsed.flatMap((one) => one.reasons)]
  const kept = parsed.flatMap((one) => (one.data === null ? [] : [one.data]))
  if (manifest.data === null || kept.length !== parsed.length) {
    return { drop, reasons, converted: null, named: [] }
  }
  const converted = convertBundledProject({ ...manifest.data, taskDocuments: kept })
  return { drop, reasons, converted, named: drop.documents.map((one) => one.id) }
}
