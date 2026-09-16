import { scopeLabel } from './outcomes'
import type { TransferShareLink } from './vocabulary'

const NONE = 'text-muted-foreground'
const LIST = 'grid gap-1'
const ROW = 'flex flex-wrap items-baseline gap-x-2 gap-y-0.5'
const NAME = 'font-medium'
const ROLE = 'rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-brand uppercase'
const SCOPE = 'text-[12px] text-muted-foreground'

/** Props for {@link ShareLinkList}. */
export interface ShareLinkListProps {
  /** Every link the dropped group asserts, in preview order. */
  links: readonly TransferShareLink[]
}

/**
 * Every share link a dropped group asserts, one row each, with its name, its role and its scope.
 *
 * A count is not enough and never was: a bundle can assert `role: 'manage'` with an
 * attacker-chosen token, and "4 share links" hides it (§7.3, ADR 0019). There is no token here
 * to hide or to show — the wire shape has nowhere for one to sit — so what an admin is deciding
 * about is exactly the authority these three fields state.
 */
export function ShareLinkList({ links }: ShareLinkListProps) {
  if (links.length === 0) return <p className={NONE}>No share links</p>
  return (
    <ul className={LIST} data-slot="share-links">
      {links.map((link) => (
        <li className={ROW} data-slot="share-link" key={link.index}>
          <span className={NAME}>{link.name === '' ? 'Unnamed link' : link.name}</span>
          <span className={ROLE} data-slot="share-link-role">
            {link.role}
          </span>
          <span className={SCOPE} data-slot="share-link-scope">
            {scopeLabel(link.scope)}
          </span>
        </li>
      ))}
    </ul>
  )
}
