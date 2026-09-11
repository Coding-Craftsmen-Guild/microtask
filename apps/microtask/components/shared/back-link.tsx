import Link from 'next/link'
import type { ReactNode } from 'react'

/** Props for {@link BackLink}. */
export interface BackLinkProps {
  /** The page one level up. */
  href: string
  /** What it says, arrow included, such as `← Projects`. */
  children: ReactNode
}

/**
 * The muted way back to the page one level up, drawn the same above a project and above a task.
 *
 * A `<Link>` and so prefetched, which is safe because it only ever points at a page that reads:
 * never at `/login`, whose arrival is not a place any page links to (ADR 0032).
 */
export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link className="w-fit text-[13px] text-muted-foreground no-underline hover:text-brand" href={href}>
      {children}
    </Link>
  )
}
