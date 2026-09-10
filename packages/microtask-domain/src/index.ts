export { emptyDocument, type DocumentJson } from './entities/document.js'
export { NO_PROGRESS, type Progress } from './entities/progress.js'
export type { Tab } from './entities/tab.js'
export type { TaskDocument } from './entities/task.js'
export type { Folder } from './entities/folder.js'
export type { ShareLink } from './entities/share-link.js'
export type { ProjectManifest, TaskEntry } from './entities/manifest.js'
export { agreesWith, countTabs, countTasks } from './progress.js'
export { assertSafeDocument, SAFE_HREF_SCHEMES } from './document-guard.js'
export {
  assertWithin,
  cleanName,
  LIMITS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_DEPTH,
  type CountLimitKey,
  type LimitKey,
} from './limits.js'
export type { ProjectStore } from './ports/project-store.js'
export type { TokenIndex, TokenOwner } from './ports/token-index.js'
export type { ServiceContext } from './services/context.js'
export type { ProjectRef, TaskRef } from './services/refs.js'
export { FolderService } from './services/folder-service.js'
export { ProjectService } from './services/project-service.js'
export { SearchService, type SearchResult } from './services/search-service.js'
export { ShareLinkService, type ShareLinkRequest } from './services/share-link-service.js'
export { TabService } from './services/tab-service.js'
export { TaskService, type TaskDetail } from './services/task-service.js'
export { FsProjectStore, type FsProjectStoreOptions } from './storage/fs-project-store.js'
export { ShareIndex } from './storage/share-index.js'
export { manifestFile, projectDir, projectsDir, taskFile, tasksDir } from './storage/paths.js'
