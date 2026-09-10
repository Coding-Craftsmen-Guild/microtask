/** What a request is acting on. `workspace` covers collections and top-level actions. */
export type Target =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'folder'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'tab'; readonly projectId: string; readonly taskId: string }
