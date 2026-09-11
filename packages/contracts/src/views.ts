import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { Folder } from './folder.js'
import { Progress } from './progress.js'
import { ProjectManifest } from './project.js'
import { Role, Scope } from './share-link.js'
import { TaskDocument } from './task.js'

/**
 * One project as a particular caller may be told about it.
 *
 * The manifest shape with `shareLinks` made **optional**, because an admin-only block a caller is
 * refused is absent rather than empty (ADR 0013). Extended from {@link ProjectManifest} rather
 * than restated, so a field added to a project cannot appear in a response without appearing
 * here, and so neither collection bound is written down a second time.
 *
 * The three collections are respelled only to be `readonly`, which is what the domain's view
 * hands back. `readonly` is a TypeScript-only distinction and generates identically — what it
 * buys is a handler that returns the view directly, with no copy and no cast.
 *
 * It lives here rather than in a route file because the typed client is built from these same
 * schemas: a response shape declared beside a handler is a shape the client can drift from.
 */
export const ProjectView = ProjectManifest.extend({
  folders: ProjectManifest.shape.folders.readonly(),
  tasks: ProjectManifest.shape.tasks.readonly(),
  shareLinks: ProjectManifest.shape.shareLinks.readonly().optional(),
}).meta({ id: 'ProjectView', description: 'A project, shaped for whoever asked about it' })

/**
 * One task as a particular caller may be told about it: its entry, its tabs, and where it sits.
 *
 * `folder` is `null` for a caller the policy refuses a folder target — a task-scoped link, which
 * must not learn the name of the folder its task sits in because that name can itself identify
 * another client (ADR 0011). A task at the project root reads the same way, so the two are
 * indistinguishable from outside, which is the point.
 *
 * `progress` is counted from the tabs in the same payload rather than echoed from the manifest
 * cache, so it can never contradict the checkboxes beside it (ADR 0007).
 */
export const TaskView = z
  .object({
    projectId: EntityId,
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    folder: Folder.nullable(),
    progress: Progress,
    tabs: TaskDocument.shape.tabs.readonly(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'TaskView', description: 'One task and its tabs, shaped for whoever asked' })

/** Every project a caller may be told about, most recently updated first. */
export const ProjectList = z
  .object({ projects: z.array(ProjectView).readonly() })
  .meta({ id: 'ProjectList', description: 'The projects of one product' })

/** The folders of one project, in the order they are shown. */
export const FolderList = z
  .object({ folders: ProjectManifest.shape.folders.readonly() })
  .meta({ id: 'FolderList', description: "One project's folders, in order" })

/** The task entries of one folder group, in the order they are shown. */
export const TaskEntryList = z
  .object({ tasks: ProjectManifest.shape.tasks.readonly() })
  .meta({ id: 'TaskEntryList', description: 'Task entries, in order' })

/**
 * The tabs of one task, in the order they are shown.
 *
 * The bound comes from {@link TaskDocument} rather than from a number written twice, so the cap
 * on how many tabs a task may carry is recorded once and a reorder can never describe more tabs
 * than a task is allowed to hold. Each row is a whole tab, document included: a reorder is the
 * one call that hands back every tab at once, and a client that had to re-read each of them to
 * learn its new position would be doing the renumbering a second time.
 */
export const TabList = z
  .object({ tabs: TaskDocument.shape.tabs.readonly() })
  .meta({ id: 'TabList', description: "One task's tabs, in order" })

/**
 * The share links of one project, in the order they were minted.
 *
 * The collection bound is taken from the manifest rather than restated, so the cap on how many
 * seats a project may carry is written down once.
 */
export const ShareLinkList = z
  .object({ shareLinks: ProjectManifest.shape.shareLinks.readonly() })
  .meta({ id: 'ShareLinkList', description: "One project's share links, in minting order" })

/**
 * Everything one revocation took: the link named, and each link descended from it.
 *
 * It reports the whole set rather than a count, because a caller cutting a leaked manager needs
 * to be able to say *which* seats went dark, and a number cannot be checked against anything
 * (ADR 0010).
 */
export const RevokedShareLinks = z
  .object({ revoked: ProjectManifest.shape.shareLinks.readonly() })
  .meta({ id: 'RevokedShareLinks', description: 'Every share link one revocation removed' })

/**
 * What one share link is and what it reaches: the answer the bootstrap call gives.
 *
 * It carries **no token**, its own included. The caller sent its token to ask the question, so
 * echoing it back tells nobody anything and only puts a live credential into another response
 * body — and having no token field at all is what makes "never another link's token" true by
 * construction rather than by filtering (ADR 0017).
 */
export const ShareView = z
  .object({
    role: Role,
    scope: Scope,
    project: z.object({ id: EntityId, name: EntityName }),
    folders: ProjectManifest.shape.folders.readonly(),
    tasks: ProjectManifest.shape.tasks.readonly(),
  })
  .meta({ id: 'ShareView', description: 'What the credential that asked can reach' })
