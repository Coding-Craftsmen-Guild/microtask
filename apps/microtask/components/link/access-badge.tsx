import { CAN_EDIT, VIEW_ONLY } from './copy'

const EDIT = 'rounded-full bg-gold/25 px-2.5 py-0.5 text-[12px] font-semibold text-foreground'

const VIEW = 'rounded-full bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-brand'

/** Props for {@link AccessBadge}. */
export interface AccessBadgeProps {
  /** Whether this link's editor is writable, from `capabilities()['tab:write']`. */
  writable: boolean
}

/**
 * The client head's access badge: `You can edit` on a gold tint, or `View only` on an indigo one,
 * as the app being replaced drew it.
 *
 * Decided by whether the editor is writable — a capability — rather than by the role's name, so a
 * `manage` link reads `You can edit` for the reason a `write` link does (ADR 0038).
 */
export function AccessBadge({ writable }: AccessBadgeProps) {
  return <span className={writable ? EDIT : VIEW}>{writable ? CAN_EDIT : VIEW_ONLY}</span>
}
