import type { RoleValue, ScopeValue } from '@repo/contracts'
import { plural } from '../projects/summary'
import type { ScopeChoice } from './types'

/** What each role is called on a link's badge: legacy's two labels, and the role it lacked. */
export const ROLE_LABEL: Readonly<Record<RoleValue, string>> = {
  view: 'Read only',
  write: 'Read & write',
  manage: 'Manage',
}

/** A link's name, or `Unnamed link` — production data holds a link with no name. */
export const linkName = (name: string): string => (name.trim() === '' ? 'Unnamed link' : name)

/**
 * What a link opens: the task's name, `Whole project`, or `A deleted task`.
 *
 * The last is real rather than defensive: deleting a task leaves a link scoped to it in the
 * manifest, and the manager has to be able to show it so it can be revoked.
 */
export function scopeLabel(scope: ScopeValue, choices: readonly ScopeChoice[]): string {
  if (scope.kind === 'project') return 'Whole project'
  return choices.find((choice) => choice.value === scope.taskId)?.label ?? 'A deleted task'
}

/** The revoke question: the name quoted, or `this link` when there is none — as it was. */
export const revokeTitle = (name: string): string =>
  name.trim() === '' ? 'Revoke this link?' : `Revoke “${name}”?`

/**
 * What a revoke does, said before it is chosen.
 *
 * A `manage` link is the only kind that can mint others, and revoking it revokes them too
 * (ADR 0010), so it is the one whose message has to say so.
 */
export const revokeMessage = (role: RoleValue): string =>
  role === 'manage'
    ? 'Anyone using it loses access immediately, and so does every link created with it. This cannot be undone.'
    : 'Anyone using it loses access immediately. This cannot be undone.'

/** What a finished revoke says, counting the cascade rather than hiding it. */
export const revokedNotice = (count: number): string =>
  count <= 1 ? 'Link revoked.' : `${plural(count, 'link')} revoked: this one and ${String(count - 1)} created with it.`
