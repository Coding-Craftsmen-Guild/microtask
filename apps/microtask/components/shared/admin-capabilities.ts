import { CAPABILITY_ACTIONS, type Capabilities } from '@repo/contracts'

/**
 * What the admin may do: every action, because an admin is not a role in the capability model.
 *
 * `capabilities()` has no admin case — an admin clears everything and holds no scope to ask
 * about — so the admin surface passes this record instead, and every component reads the same
 * record shape whichever principal is rendering. That is what lets the client surface reuse the
 * tree, the tab strip and the share manager with `capabilities(role, scope)` and nothing else
 * changed (ADR 0038).
 */
export const ADMIN_CAPABILITIES: Capabilities = Object.fromEntries(
  CAPABILITY_ACTIONS.map((action) => [action, true]),
) as Capabilities
