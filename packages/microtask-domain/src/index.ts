export { emptyDocument, type DocumentJson } from './entities/document.js'
export { NO_PROGRESS, type Progress } from './entities/progress.js'
export type { Tab } from './entities/tab.js'
export type { TaskDocument } from './entities/task.js'
export type { Folder } from './entities/folder.js'
export type { ShareLink } from './entities/share-link.js'
export type { ProjectManifest, TaskEntry } from './entities/manifest.js'
export { agreesWith, countTabs, countTasks } from './progress.js'
export { cacheAgrees, taskCache, type TaskCache } from './services/task-cache.js'
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
export {
  duplicatePaths,
  groupImportFiles,
  MANIFEST_FILE_NAME,
  normaliseImportPath,
  type ImportFile,
  type ImportGroup,
} from './import/grouping.js'
export { elideMiddle, sniffGroup, sniffImportFiles, type SniffedGroup } from './import/sniff.js'
export {
  convertBundledProject,
  convertLegacyProject,
  type BundledProject,
  type ConvertedProject,
} from './import/legacy.js'
export {
  checkImport,
  overBound,
  type CheckedProject,
  type DroppedDocument,
  type DroppedProject,
  type ImportTarget,
} from './import/checks.js'
export type { ProjectStore } from './ports/project-store.js'
export type { TokenIndex, TokenOwner } from './ports/token-index.js'
export type { ServiceContext } from './services/context.js'
export type { ProjectRef, TaskRef } from './services/refs.js'
export { FolderService } from './services/folder-service.js'
export { ProjectService } from './services/project-service.js'
export { SearchService, type SearchResult } from './services/search-service.js'
export { requestedScope, type ScopeRequest } from './services/share-link-mapper.js'
export {
  ShareLinkService,
  type ShareLinkChange,
  type ShareLinkRequest,
} from './services/share-link-service.js'
export { TabService } from './services/tab-service.js'
export { TaskService, type TaskDetail } from './services/task-service.js'
export {
  projectListItem,
  projectView,
  type ProjectListItem,
  type ProjectView,
} from './views/project-view.js'
export { shareView, type ShareView } from './views/share-view.js'
export { taskView, type TaskView } from './views/task-view.js'
export { FsProjectStore, type FsProjectStoreOptions } from './storage/fs-project-store.js'
export { ShareIndex } from './storage/share-index.js'
export { manifestFile, projectDir, projectsDir, taskFile, tasksDir } from './storage/paths.js'
