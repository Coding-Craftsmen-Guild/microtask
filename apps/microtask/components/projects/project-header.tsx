import type { Capabilities } from '@repo/contracts'
import type { ActionResult } from '../../actions/result'
import { BackLink } from '../shared/back-link'
import { ShareManager } from '../share-manager/share-manager'
import { shareControls, type ShareActions } from '../share-manager/types'
import { OverallProgress } from './overall-progress'
import type { ProjectPageModel } from './page-model'
import { PROJECTS_INDEX_PATH } from './paths'
import { ProjectTitle } from './project-title'

/** Props for {@link ProjectHeader}. */
export interface ProjectHeaderProps {
  /** The page's token-free model. */
  model: ProjectPageModel
  /** What the viewer may do, from which every control here is drawn. */
  can: Capabilities
  /** Renames the project. */
  onRename: (projectId: string, name: string) => Promise<ActionResult<string>>
  /** The share manager's reads and writes. */
  share: ShareActions
}

/**
 * `← Projects`, the editable title, overall progress, and Share — the project page's head.
 *
 * It is handed the page model and never the project view, so the one component that exists to
 * talk about share links cannot be given a token to talk about (ADR 0033).
 */
export function ProjectHeader({ model, can, onRename, share }: ProjectHeaderProps) {
  return (
    <div className="grid gap-3 pt-5">
      <BackLink href={PROJECTS_INDEX_PATH}>← Projects</BackLink>
      <div className="flex items-center gap-4 max-sm:flex-wrap">
        <ProjectTitle editable={can['project:rename']} name={model.name} onRename={onRename} projectId={model.id} />
        <OverallProgress done={model.progress.done} total={model.progress.total} />
        <ShareManager
          actions={share}
          choices={model.choices}
          controls={shareControls(can)}
          count={model.shareLinkCount}
          exposure={model.exposure}
          projectId={model.id}
        />
      </div>
    </div>
  )
}
