/** What a share link may reach. */
export type Scope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
