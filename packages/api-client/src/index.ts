export { createAdminClient, type AdminClient } from './admin-client.js'
export { createLinkClient, type LinkClient } from './link-client.js'
export {
  createMacroplanAdminClient,
  createMacroplanLinkClient,
  type MacroplanAdminClient,
  type MacroplanLinkClient,
  type MacroplanSessionClient,
} from './macroplan-clients.js'
export { login, type AdminSessionValue } from './login.js'
export {
  ApiError,
  type ApiErrorInit,
  type FieldError,
  type ValidationTarget,
} from './api-error.js'
export { createTransport, type Call, type RawCall, type Transport } from './transport.js'
export { createSurface, type MicrotaskApi } from './surface.js'
export { createMacroplanSurface, type MacroplanApi } from './macroplan-surface.js'
export {
  CURRENT_SHARE_PATH,
  IMPORT_SESSIONS_PATH,
  LOGIN_PATH,
  MACROPLAN_CURRENT_SHARE_PATH,
  MACROPLAN_PLANS_PATH,
  PROJECTS_PATH,
  SEARCH_PATH,
  WORKSPACE_EXPORT_PATH,
  importSessionPath,
  planItemPath,
  planPath,
  projectExportPath,
  projectPath,
  tabPath,
  taskPath,
} from './paths.js'
export type { FoldersApi } from './operations/folders.js'
export type { Plan, PlansApi } from './operations/plans.js'
export type { Project, ProjectsApi } from './operations/projects.js'
export type { NewShareLink, ShareLinkChange, ShareLinksApi } from './operations/share-links.js'
export type { Document, TabsApi } from './operations/tabs.js'
export type { NewTask, TasksApi } from './operations/tasks.js'
export type { ChunkRef, ImportConfirmation, TransferApi } from './operations/transfer.js'
export type { ClientOptions, Decoded, Decoder, Fetcher, TabRef, TaskRef } from './types.js'
