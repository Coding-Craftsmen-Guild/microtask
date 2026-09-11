import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { Folder } from './folder.js'
import { Progress } from './progress.js'
import { ProjectManifest } from './project.js'
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
