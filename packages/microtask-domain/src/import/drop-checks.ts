import { ProjectManifest, TaskDocument } from '@repo/contracts'
import type { ProjectManifest as Manifest } from '../entities/manifest.js'
import type { TaskDocument as Document } from '../entities/task.js'
import { convertBundledProject, type ConvertedProject } from './legacy.js'
import { listed, located, quotedId, quotedPath, when } from './refusal.js'

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
 * One project a drop carried, in the form the shape it was sniffed as holds it.
 *
 * Two members and not `ImportShape`'s four, because the three v2 shapes differ in how a *group* is
 * laid out and not at all in what has to happen to it here: a manifest and its documents are
 * schema-checked and then converted, whichever of the three carried them. A caller therefore
 * explodes a `v2-workspace-bundle` into one of these per project — which is also what
 * `ImportPreview` requires, a project id being claimable by at most one group.
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
      readonly shape: 'v2'
      readonly path: string
      readonly manifest: unknown
      readonly documents: readonly DroppedDocument[]
    }
  | {
      readonly shape: 'legacy'
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

const missingFrom = (wanted: readonly string[], held: ReadonlySet<string>): readonly string[] => [
  ...new Set(wanted.filter((id) => !held.has(id))),
]

/**
 * Compares the ids a manifest names against the ids the drop carried documents for.
 *
 * By **id and not by count**, which is the whole point: nine entries beside nine files whose ids do
 * not correspond is the same observable failure ADR 0018 exists to prevent — nine documents on the
 * floor behind a preview that truthfully says "9 and 9" — and a count comparison cannot see it.
 * Both differences are reported, because they are different problems with different remedies: an
 * entry with no document restores an empty task, a document no entry names is content nothing will
 * ever open.
 *
 * The third reason has no set difference behind it and is the case neither difference can see: a
 * file named `tasks/<id>.json` for an id the manifest does name, holding the document of a
 * different task. `convertBundledProject` pairs a document to its entry by the id **inside** the
 * document, so such a file leaves its entry's cache untouched and puts the wrong content where the
 * manifest says the right content is.
 */
export function crossCheckReasons(
  manifest: Manifest,
  documents: readonly Document[],
  named: readonly (string | null)[],
): readonly string[] {
  const carried = documents.map((one, index) => named[index] ?? one.id)
  const wanted = manifest.tasks.map((entry) => entry.id)
  const orphaned = missingFrom(wanted, new Set(carried))
  const spare = missingFrom(carried, new Set(wanted))
  const misfiled = documents.filter((one, index) => (named[index] ?? one.id) !== one.id)
  return [
    ...when(
      orphaned.length > 0,
      `The manifest names tasks the drop carries no document for: ${listed(orphaned)}`,
    ),
    ...when(
      spare.length > 0,
      `The drop carries documents the manifest names no task for: ${listed(spare)}`,
    ),
    ...misfiled.map((one) => `A task file holds the document of task ${quotedId(one.id)}`),
  ]
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
  if (drop.shape === 'legacy') {
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
