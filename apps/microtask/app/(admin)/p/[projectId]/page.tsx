import type { Metadata } from 'next'
import {
  ADMIN_RENAME_PROJECT,
  ADMIN_SHARE_ACTIONS,
  ADMIN_TREE_ACTIONS,
} from '../../../../components/projects/admin-actions'
import { loadProject } from '../../../../components/projects/load'
import { projectPageModel } from '../../../../components/projects/page-model'
import { ProjectHeader } from '../../../../components/projects/project-header'
import { ADMIN_CAPABILITIES, ADMIN_TREE } from '../../../../components/task-tree/controls'
import { TaskTree } from '../../../../components/task-tree/task-tree'

/** The route's own parameters, which Next hands a page as a promise. */
export interface ProjectPageProps {
  /** `projectId` from `/p/[projectId]`, untrusted until the API has read it. */
  readonly params: Promise<{ readonly projectId: string }>
}

/** The tab title legacy set after load: the project's name, then the product. */
export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const loaded = await loadProject((await params).projectId)
  return { title: loaded.ok ? `${loaded.value.name} · CC Guild Microtask` : 'Project · CC Guild Microtask' }
}

/**
 * `/p/[projectId]`: the project's head, and its folder tree and task list.
 *
 * The page reads `projects.read()` once — shared with `generateMetadata` — and reduces it on the
 * server to a model that holds **no share token**. The share manager is handed a count; its links
 * load when an admin opens it (ADR 0033). Every control is drawn from a capability record, an
 * admin's here, so the same components render for a link holder from `capabilities()`.
 */
export default async function ProjectPage({ params }: ProjectPageProps) {
  const loaded = await loadProject((await params).projectId)
  if (!loaded.ok) {
    return (
      <p className="py-16 text-center text-muted-foreground" role="alert">
        {loaded.detail}
      </p>
    )
  }
  const model = projectPageModel(loaded.value)
  return (
    <div className="grid gap-6">
      <ProjectHeader can={ADMIN_CAPABILITIES} model={model} onRename={ADMIN_RENAME_PROJECT} share={ADMIN_SHARE_ACTIONS} />
      <TaskTree
        actions={ADMIN_TREE_ACTIONS}
        controls={ADMIN_TREE}
        folders={model.folders}
        linkCounts={model.linkCounts}
        now={Date.now()}
        projectId={model.id}
        tasks={model.tasks}
      />
    </div>
  )
}
