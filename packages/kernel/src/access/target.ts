/** Every kind of thing a request can act on. The list `Target` is derived from. */
export const TARGET_KINDS = [
  'workspace',
  'project',
  'folder',
  'task',
  'tab',
  'plan',
  'epic',
  'label',
  'feature',
  'item',
] as const

type TargetKind = (typeof TARGET_KINDS)[number]

interface TargetShapeByKind {
  workspace: { readonly kind: 'workspace' }
  project: { readonly kind: 'project'; readonly projectId: string }
  folder: { readonly kind: 'folder'; readonly projectId: string }
  task: { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  tab: { readonly kind: 'tab'; readonly projectId: string; readonly taskId: string }
  plan: { readonly kind: 'plan'; readonly planId: string }
  epic: { readonly kind: 'epic'; readonly planId: string }
  label: { readonly kind: 'label'; readonly planId: string }
  feature: { readonly kind: 'feature'; readonly planId: string }
  item: { readonly kind: 'item'; readonly planId: string }
}

/**
 * What a request is acting on. `workspace` covers collections and top-level actions.
 *
 * Computed as `TargetShapeByKind[TargetKind]` rather than written out as its own union, so a kind
 * added to `TARGET_KINDS` without a matching entry in `TargetShapeByKind` fails to compile instead
 * of quietly typing as `never` in one place and a full union in the other.
 *
 * The five Macroplan kinds carry `planId` alone. A share link's scope is plan-wide, so no rule
 * turns on an epic, label, feature or item id, and a field no rule reads is a field that will one
 * day be compared wrongly.
 */
export type Target = TargetShapeByKind[TargetKind]
