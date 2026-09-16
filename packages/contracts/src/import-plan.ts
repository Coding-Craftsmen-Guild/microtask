import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { LIMITS } from './limits.js'
import { ShareLink } from './share-link.js'

/**
 * What one dropped directory group was detected as: the four shapes of ADR 0018, or none of them.
 *
 * `unrecognised` is a member rather than an absent value because a group that matched nothing
 * still has a row in the preview — a `tasks/*.json` orphan with no sibling manifest, a `format`
 * this repo does not read, a loose file that is not ours. Silent skipping is the failure ADR 0018
 * was written about, so every group is named and its outcome says what will happen to it.
 */
export const ImportShape = z
  .enum(['v2-workspace-bundle', 'v2-single-project', 'v2-project-directory', 'legacy-project', 'unrecognised'])
  .meta({ id: 'ImportShape', description: 'What a dropped directory group was detected as' })

/**
 * What the preview says will happen to one group: it imports, it is refused, or it is broken.
 *
 * Three outcomes and no fourth: a check that merely warns is a check an admin clicks past, so
 * every failing check blocks the group it belongs to.
 */
export const ImportOutcome = z
  .enum(['importable', 'blocked', 'error'])
  .meta({ id: 'ImportOutcome', description: 'Whether a group will import, and whether it was even read' })

/**
 * The longest a preview row's `path`, or one of its `reasons`, may be in characters.
 *
 * Both hold text the **drop** chose — a path is an archive entry name, and a reason quotes the id
 * or the name that failed — so both are bounded the way a manifest entry's `tabNames` is bounded
 * by `MAX_LISTED_TAB_NAMES`: the builder cuts, and the schema records the cap it cut to. Eliding
 * is the builder's job and not the schema's, because a schema that truncated a path would answer
 * with a path that addresses nothing; a longer path arrives with its middle elided, which keeps
 * the two ends that identify it.
 */
export const MAX_PREVIEW_TEXT_LENGTH = 200

/**
 * How many reasons one group carries before the builder stops adding them.
 *
 * §7.3 wants every problem at once rather than a queue of re-uploads, so this is generous rather
 * than tight. A group failing more ways than this is not one an admin imports on the strength of
 * the first few, and what still matters is that there were more — which the builder spends the
 * last reason saying.
 */
export const MAX_PREVIEW_REASONS = 20

/**
 * One share link a bundle asserts, as the preview is allowed to describe it.
 *
 * Derived from {@link ShareLink} by removing `token`, `createdBy` and `createdAt` rather than by
 * restating the three fields that stay, so the one thing this shape exists to guarantee is a
 * property of the type: **there is nowhere for a token to sit.** The preview is rendered into an
 * admin page, which means serialised into the Flight payload and into the HTML, and a bundle may
 * carry fifty links per project — a preview carrying tokens would be a credential dump with no
 * dialog in front of it, which is the disclosure ADR 0033 exists to close. `createdBy` goes for
 * the same reason: it is a token too, the parent's.
 *
 * `createdAt` is neither, and goes because the decision §7.3 asks the admin to make is whether to
 * accept the authority a dropped file asserts. The date a link in a file of unknown provenance
 * claims to have been minted on is not evidence about that, and the stamps the imported link ends
 * up carrying are Task 8's to write rather than this shape's to quote.
 *
 * Nothing is lost by their absence. What an admin has to decide is whether to accept that
 * authority, and §7.3 and ADR 0019 both say that is `role` and `scope` — a counts-only preview
 * would hide an attacker-chosen `manage` link, and the token would not make it any more visible.
 * `index` is the link's position in this preview, which is how a later confirm names one link
 * without naming its credential.
 *
 * An unknown key is **stripped** rather than refused, matching every other shape here that drops
 * what a caller must not choose. The preview is assembled server-side from a manifest that was
 * just read, so the failure this guards against is a field-by-field copy that forgot to drop the
 * token — and correcting that quietly is strictly better than answering an admin's preview with a
 * 500, which would withhold exactly the information they came for. `name` is relaxed the way
 * {@link ShareLink}'s own name is, for the reason {@link ImportPreviewGroup} gives.
 */
export const ImportPreviewShareLink = ShareLink.omit({ token: true, createdBy: true, createdAt: true })
  .extend({ index: z.number().int().min(0), name: EntityName.or(z.literal('')) })
  .meta({ id: 'ImportPreviewShareLink', description: 'A share link a bundle asserts, named by index, never by token' })

const explained = (group: {
  readonly outcome: z.infer<typeof ImportOutcome>
  readonly reasons: readonly string[]
}): boolean => group.outcome === 'importable' || group.reasons.length > 0

const previewGroupFields = z.object({
  path: z.string().max(MAX_PREVIEW_TEXT_LENGTH),
  shape: ImportShape,
  projectId: EntityId.nullable(),
  name: EntityName.or(z.literal('')),
  manifestTaskCount: z.number().int().min(0).nullable(),
  taskFilesFound: z.number().int().min(0),
  shareLinks: z.array(ImportPreviewShareLink).readonly(),
  existsInTarget: z.boolean(),
  outcome: ImportOutcome,
  reasons: z.array(z.string().max(MAX_PREVIEW_TEXT_LENGTH)).max(MAX_PREVIEW_REASONS).readonly(),
})

/**
 * One group of dropped files and what will happen to it, which is the row §7.3 renders.
 *
 * `path` is the normalised relative path the group was harvested under, bounded by
 * {@link MAX_PREVIEW_TEXT_LENGTH}. It is here because two groups can otherwise be
 * indistinguishable — an error row has no project to name — and because ADR 0018 requires a
 * missing manifest to be reported against the directory that is missing it.
 *
 * `projectId` stays a real {@link EntityId} and is `null` when there is none to report, rather than
 * being relaxed to a string: it becomes a path segment and an id failing the ULID pattern is
 * rejected and never sanitised (ADR 0019), so a hostile id belongs in a reason that quotes it and
 * not in a field a confirm could read back. `name` is the opposite case and is relaxed the same way
 * {@link ShareLink}'s name is, rather than bounded a second time: it is display-only and it is the
 * name `cleanName` will actually write — already trimmed, collapsed and cut to `nameLength`, which
 * is exactly the set `EntityName` or `''` accepts — and a preview that could not encode the name of
 * the project it is refusing would fail to render the refusal.
 *
 * `manifestTaskCount` is `null` when no manifest was found at all, which is a different fact from a
 * manifest naming no tasks and reads differently in the table. Neither count is bounded by
 * `tasksPerProject`, because the count that has to be shown most urgently is the one that is over
 * the bound. `taskFilesFound` counts the task files in the group, or — for a bundle, where the
 * documents are embedded rather than beside the manifest — the documents carried, so one number
 * means the same thing in every shape and the cross-check reads the same way.
 *
 * `existsInTarget` says a project with this id is already in the target store. It is set by the
 * same disk read the token-uniqueness check performs, so it costs no I/O of its own, and it is what
 * lets the panel say the sentence §7.4 requires before an admin chooses `new`: *"N share links will
 * get new URLs; the existing project's links keep working."*
 *
 * `reasons` is plural because the preview has to describe every problem at once — a group can fail
 * the cross-check and carry a bad href, and reporting one at a time turns a migration into a queue
 * of re-uploads. A group that is not `importable` must carry at least one, checked here so that a
 * blocked row can never render with nothing in it, and the list is bounded by
 * {@link MAX_PREVIEW_REASONS}.
 *
 * That check makes this a refined object schema, and in zod 4 that closes most of the ways this
 * package composes: `.omit()`, `.pick()` and `.partial()` **throw where they are called** (zod
 * 4.6.1), and `z.object({ ...ImportPreviewGroup.shape })` silently drops the check. `.extend()`
 * with a new key carries it, and overwriting a key needs `.safeExtend()`. So a shape derived from
 * this one builds on the unrefined `previewGroupFields` above, as it does for the two refined
 * shapes below; exporting a base is the change to make when something outside this module needs
 * one.
 */
export const ImportPreviewGroup = previewGroupFields
  .refine(explained, { error: 'a group that will not import has to say why', path: ['reasons'] })
  .meta({ id: 'ImportPreviewGroup', description: 'One dropped group, what it is, and what will happen to it' })

const distinctProjects = (preview: {
  readonly groups: readonly Pick<z.infer<typeof ImportPreviewGroup>, 'projectId'>[]
}): boolean => {
  const claimed = preview.groups.map((group) => group.projectId).filter((id) => id !== null)
  return new Set(claimed).size === claimed.length
}

const previewFields = z.object({ sessionId: EntityId, groups: z.array(ImportPreviewGroup).readonly() })

/**
 * Everything staged under one import session, group by group. Nothing has touched disk yet.
 *
 * `groups` is unbounded, deliberately: an admin can drop more than this product will hold, and the
 * preview is where they are told so rather than a place that refuses to describe what they dropped.
 * Every row it holds is bounded in each of its own dimensions, so the count is the one dimension
 * left open rather than three.
 *
 * A `projectId` is claimed by **at most one group**, which is the schema half of Task 4's audited
 * id-uniqueness check — project ids unique across the whole session. Two groups can otherwise
 * carry one id: the same project dropped as a loose `v2-project-directory` and again inside a
 * `v2-workspace-bundle`, or one directory dropped twice. That leaves the confirm no way to say
 * what the admin meant, because {@link ImportConfirmRequest} addresses a choice by `projectId` —
 * one choice cannot single out one of two groups, and two choices for one id are refused. So the
 * second group to claim an id is reported `blocked`, carrying `projectId: null` and a reason
 * naming both paths and the id it claimed: `path` is the identity a group keeps when its id is not
 * its own to use. Refined, with the derivation hazard {@link ImportPreviewGroup} names.
 */
export const ImportPreview = previewFields
  .refine(distinctProjects, { error: 'two groups claim one project id', path: ['groups'] })
  .meta({ id: 'ImportPreview', description: 'What one staged import session holds, before anything is written' })

/**
 * What to do with a project the target store already holds.
 *
 * `replace` preserves tokens, `new` remints every one of them, and `skip` writes nothing — so this
 * one word decides whether links already in clients' hands keep working (ADR 0019).
 */
export const ConflictChoice = z
  .enum(['skip', 'new', 'replace'])
  .meta({ id: 'ConflictChoice', description: 'Skip a project, import it as new, or replace it' })

/** One project in a staged session and the choice the admin made for it. */
export const ImportProjectChoice = z
  .object({ projectId: EntityId, choice: ConflictChoice })
  .meta({ id: 'ImportProjectChoice', description: 'One project and what was chosen for it' })

const onePerProject = (request: {
  readonly choices: readonly Pick<z.infer<typeof ImportProjectChoice>, 'projectId'>[]
}): boolean => new Set(request.choices.map((one) => one.projectId)).size === request.choices.length

const confirmRequestFields = z.object({
  sessionId: EntityId,
  choices: z.array(ImportProjectChoice).max(LIMITS.projectsPerProduct),
})

/**
 * Apply one staged session, under at most one choice per project.
 *
 * It names the session rather than re-posting what was uploaded (ADR 0015): the files were staged
 * server-side under this id when they were previewed, and a confirm that carried them again would
 * be importing something nobody previewed. A route that also carries the id in its path must refuse
 * a body naming a different session rather than picking one of the two.
 *
 * `choices` is sparse. A project the target store does not hold needs no choice — it is simply
 * created — so the list covers the collisions the preview flagged, and an empty list is a
 * well-formed confirm of a session that has none.
 *
 * Two choices for one project are refused here, because there is no reading of that request a route
 * could honour; that one id addresses one group is {@link ImportPreview}'s to guarantee. A choice
 * naming a project the **session** does not hold cannot be seen from the shape at all, and is a 422
 * rather than a silent no-op — that enforcement belongs to the route, which is the only thing that
 * can see what was staged. Refined, with the derivation hazard {@link ImportPreviewGroup} names.
 */
export const ImportConfirmRequest = confirmRequestFields
  .refine(onePerProject, { error: 'a project can be given only one conflict choice', path: ['choices'] })
  .meta({ id: 'ImportConfirmRequest', description: 'Apply one staged session, one choice per project' })

/** What a group was detected as, as a value rather than as a schema. */
export type ImportShapeValue = z.infer<typeof ImportShape>

/** What will happen to a group, as a value rather than as a schema. */
export type ImportOutcomeValue = z.infer<typeof ImportOutcome>

/** One of skip, new or replace, as a value rather than as a schema. */
export type ConflictChoiceValue = z.infer<typeof ConflictChoice>

/**
 * A staged import session as it is opened, carrying the two bounds ADR 0044 sets on an upload.
 *
 * The caps are answered rather than left for a client to hard-code, because the browser is what
 * slices each file: `Blob.slice()` is given `maxChunkBytes`, and a client carrying its own copy of
 * that number would start being refused 413 the day the server's changed. `maxSessionBytes` is the
 * other half — it is what lets a client say "this drop is too large for one session" before
 * spending an upload on it, rather than learning it partway through.
 *
 * `openedAt` is the instant the sweep measures a session's age against (ADR 0045), so it is here
 * for the same reason a manifest carries its stamps: the client can see how long it has.
 */
export const ImportSession = z
  .object({
    sessionId: EntityId,
    openedAt: z.string(),
    maxChunkBytes: z.number().int().positive(),
    maxSessionBytes: z.number().int().positive(),
  })
  .meta({ id: 'ImportSession', description: 'An open import session and the bounds on uploading to it' })

/**
 * What one uploaded chunk added to a session.
 *
 * `path` is the path **the server** normalised, which is not always the one the client sent: the
 * server re-runs `normaliseImportPath` on whatever arrives, so `a//./b` is staged at `a/b`. A
 * client that assumed its own spelling survived would address the wrong file on the confirm, which
 * is why this is answered rather than implied.
 *
 * It is deliberately **not** bounded here, where every other path-shaped field in this module is.
 * The normaliser is the one authority on what a path may be and it carries its own length bound; a
 * second, shorter bound restated here could only refuse a response describing bytes that are
 * already staged — a 500 after the write, which is the worst of both answers.
 *
 * Both counts are bytes. `chunkBytes` is what this request contributed, which is what lets a
 * client check the server counted the same number it sent; `sessionBytes` is the session's running
 * total, measured against `maxSessionBytes`.
 */
export const ImportStagedChunk = z
  .object({
    path: z.string(),
    chunkBytes: z.number().int().min(0),
    sessionBytes: z.number().int().min(0),
  })
  .meta({ id: 'ImportStagedChunk', description: 'The path a chunk was staged at, and the bytes it added' })

/**
 * What expanding one staged `.zip` put into a session (ADR 0020).
 *
 * `archive` is the staged path that **was** expanded, and it no longer exists: an expansion stages
 * the archive's entries at the paths they name and then removes the archive, so what the session
 * holds afterwards is what the same folder dropped would have staged and nothing besides. A client
 * that kept addressing that path would be addressing a file the server deleted, which is why it is
 * named in the answer rather than only in the request.
 *
 * `files` and `bytes` describe the expansion — entries written, and their **uncompressed** size,
 * which is the number the archive caps are measured in and never the size of the upload. The
 * entries themselves are deliberately not listed: an archive may carry ten thousand of them, so
 * the list belongs to the preview that is about to read them rather than to this answer.
 *
 * `sessionBytes` is the session's running total afterwards, and it can be **smaller** than before:
 * the archive's own bytes leave the count as its entries join it, so a well-compressed archive of
 * a small drop shrinks the total. It is the same field {@link ImportStagedChunk} carries, measured
 * against the same `maxSessionBytes`.
 */
export const ImportExpansion = z
  .object({
    archive: z.string(),
    files: z.number().int().min(0),
    bytes: z.number().int().min(0),
    sessionBytes: z.number().int().min(0),
  })
  .meta({ id: 'ImportExpansion', description: 'What expanding one staged archive put into a session' })
