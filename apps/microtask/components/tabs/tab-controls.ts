import type { Capabilities } from '@repo/contracts'

/** The five things the task page may offer on a tab, each one a rendering answer. */
export interface TabControls {
  /** The `+` at the end of the strip. */
  readonly create: boolean

  /** Rename, in the tab menu. */
  readonly rename: boolean

  /** Delete tab, in the tab menu. */
  readonly remove: boolean

  /** Move left and Move right, in the tab menu. */
  readonly reorder: boolean

  /** Whether the editor is editable at all. */
  readonly write: boolean
}

/**
 * The tab controls a capability record allows, read off the record and never off a role.
 *
 * A `write` link can add and rename a tab but neither delete nor move one; a `manage` link can
 * do all four whatever its scope, because every tab action is decided against a tab target and a
 * task scope clears those (ADR 0038). Drawing these from the role instead is exactly how a
 * control appears that 403s on use.
 */
export function tabControls(allowed: Capabilities): TabControls {
  return {
    create: allowed['tab:create'],
    rename: allowed['tab:rename'],
    remove: allowed['tab:delete'],
    reorder: allowed['tab:reorder'],
    write: allowed['tab:write'],
  }
}
