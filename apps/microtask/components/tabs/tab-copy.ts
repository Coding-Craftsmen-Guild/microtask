import type { PrincipalKind } from '../../lib/principal'

/** The per-tab progress row's sentence on the admin surface. */
export const ADMIN_EMPTY_TAB = 'No checklist items in this tab'

/** The same sentence to a link that can edit. */
export const WRITER_EMPTY_TAB = 'No checklist items yet'

/** The same sentence to a link that can only read. */
export const READER_EMPTY_TAB = 'Nothing to tick here'

/**
 * What a tab with no checklist items says, which legacy worded three ways by viewer.
 *
 * The audience is the route's own fact, as it is everywhere else in this app, and the split
 * between the two link sentences is whether the editor is writable — a capability, not a role.
 */
export function emptyProgressText(audience: PrincipalKind, writable: boolean): string {
  if (audience === 'admin') return ADMIN_EMPTY_TAB
  return writable ? WRITER_EMPTY_TAB : READER_EMPTY_TAB
}
