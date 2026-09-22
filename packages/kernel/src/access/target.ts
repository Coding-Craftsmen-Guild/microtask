/**
 * What a request is acting on. `workspace` covers collections and top-level actions.
 *
 * The four Macroplan kinds carry `planId` alone. A share link's scope is plan-wide, so no rule
 * turns on an epic, feature or item id, and a field no rule reads is a field that will one day
 * be compared wrongly.
 */
export type Target =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'folder'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'tab'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'plan'; readonly planId: string }
  | { readonly kind: 'epic'; readonly planId: string }
  | { readonly kind: 'feature'; readonly planId: string }
  | { readonly kind: 'item'; readonly planId: string }
