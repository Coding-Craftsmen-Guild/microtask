import { z } from 'zod'
import { EntityId } from './document.js'
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

const PreviewName = z.string().max(LIMITS.nameLength)

/**
 * One share link a bundle asserts, as the preview is allowed to describe it.
 *
 * Derived from {@link ShareLink} by removing `token` and `createdBy` rather than by restating the
 * three fields that stay, so the one thing this shape exists to guarantee is a property of the
 * type: **there is nowhere for a token to sit.** The preview is rendered into an admin page, which
 * means serialised into the Flight payload and into the HTML, and a bundle may carry fifty links
 * per project — a preview carrying tokens would be a credential dump with no dialog in front of
 * it, which is the disclosure ADR 0033 exists to close. `createdBy` goes for the same reason: it
 * is a token too, the parent's.
 *
 * Nothing is lost by their absence. What an admin has to decide is whether to accept the authority
 * a dropped file is asserting, and §7.3 and ADR 0019 both say that is `role` and `scope` — a
 * counts-only preview would hide an attacker-chosen `manage` link, and the token would not make it
 * any more visible. `index` is the link's position in this preview, which is how a later confirm
 * names one link without naming its credential.
 *
 * An unknown key is **stripped** rather than refused, matching every other shape here that drops
 * what a caller must not choose. The preview is assembled server-side from a manifest that was
 * just read, so the failure this guards against is a field-by-field copy that forgot to drop the
 * token — and correcting that quietly is strictly better than answering an admin's preview with a
 * 500, which would withhold exactly the information they came for. `name` is relaxed from
 * `EntityName` for the reason {@link ImportPreviewGroup} gives.
 */
export const ImportPreviewShareLink = ShareLink.omit({ token: true, createdBy: true, createdAt: true })
  .extend({ index: z.number().int().min(0), name: PreviewName })
  .meta({ id: 'ImportPreviewShareLink', description: 'A share link a bundle asserts, named by index, never by token' })

const explained = (group: { readonly outcome: string; readonly reasons: readonly string[] }): boolean =>
  group.outcome === 'importable' || group.reasons.length > 0

/**
 * One group of dropped files and what will happen to it, which is the row §7.3 renders.
 *
 * `path` is the normalised relative path the group was harvested under. It is here because two
 * groups can otherwise be indistinguishable — an error row has no project to name — and because
 * ADR 0018 requires a missing manifest to be reported against the directory that is missing it.
 *
 * `projectId` stays a real {@link EntityId} and is `null` when there is none to report, rather than
 * being relaxed to a string: it becomes a path segment and an id failing the ULID pattern is
 * rejected and never sanitised (ADR 0019), so a hostile id belongs in a reason that quotes it and
 * not in a field a confirm could read back. `name` is the opposite case and is relaxed to a bounded
 * string, accepting `''` and refusing anything over `nameLength`: it is display-only, it is the
 * name `cleanName` will actually write, and a preview that could not encode the name of the
 * project it is refusing would fail to render the refusal.
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
 * `reasons` is plural because §7.3's preview has to describe every problem at once — a group can
 * fail the cross-check and carry a bad href, and reporting one at a time turns a migration into a
 * queue of re-uploads. A group that is not `importable` must carry at least one, checked here so
 * that a blocked row can never render with nothing in it.
 */
export const ImportPreviewGroup = z
  .object({
    path: z.string(),
    shape: ImportShape,
    projectId: EntityId.nullable(),
    name: PreviewName,
    manifestTaskCount: z.number().int().min(0).nullable(),
    taskFilesFound: z.number().int().min(0),
    shareLinks: z.array(ImportPreviewShareLink).readonly(),
    existsInTarget: z.boolean(),
    outcome: ImportOutcome,
    reasons: z.array(z.string()).readonly(),
  })
  .refine(explained, { error: 'a group that will not import has to say why', path: ['reasons'] })
  .meta({ id: 'ImportPreviewGroup', description: 'One dropped group, what it is, and what will happen to it' })

/**
 * Everything staged under one import session, group by group. Nothing has touched disk yet.
 *
 * `groups` is unbounded, deliberately: an admin can drop more than this product will hold, and the
 * preview is where they are told so rather than a place that refuses to describe what they dropped.
 */
export const ImportPreview = z
  .object({ sessionId: EntityId, groups: z.array(ImportPreviewGroup).readonly() })
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

const onePerProject = (request: { readonly choices: readonly { readonly projectId: string }[] }): boolean =>
  new Set(request.choices.map((one) => one.projectId)).size === request.choices.length

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
 * could honour. A choice naming a project the **session** does not hold cannot be seen from the
 * shape at all, and is a 422 rather than a silent no-op — that enforcement belongs to the route,
 * which is the only thing that can see what was staged.
 */
export const ImportConfirmRequest = z
  .object({
    sessionId: EntityId,
    choices: z.array(ImportProjectChoice).max(LIMITS.projectsPerProduct),
  })
  .refine(onePerProject, { error: 'a project can be given only one conflict choice', path: ['choices'] })
  .meta({ id: 'ImportConfirmRequest', description: 'Apply one staged session, one choice per project' })

/** What a group was detected as, as a value rather than as a schema. */
export type ImportShapeValue = z.infer<typeof ImportShape>

/** What will happen to a group, as a value rather than as a schema. */
export type ImportOutcomeValue = z.infer<typeof ImportOutcome>

/** One previewed share link as a value rather than as a schema. */
export type ImportPreviewShareLinkValue = z.infer<typeof ImportPreviewShareLink>

/** One previewed group as a value rather than as a schema. */
export type ImportPreviewGroupValue = z.infer<typeof ImportPreviewGroup>

/** One whole preview as a value rather than as a schema. */
export type ImportPreviewValue = z.infer<typeof ImportPreview>

/** A conflict choice as a value rather than as a schema. */
export type ConflictChoiceValue = z.infer<typeof ConflictChoice>

/** One project's conflict choice as a value rather than as a schema. */
export type ImportProjectChoiceValue = z.infer<typeof ImportProjectChoice>

/** A confirm request as a value rather than as a schema. */
export type ImportConfirmRequestValue = z.infer<typeof ImportConfirmRequest>
