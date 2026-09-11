import type { ReactNode } from 'react'
import { LinkFrame } from '../../../components/link/link-frame'
import { linkPath } from '../../../components/link/paths'

/** Props for {@link LinkLayout}. */
export interface LinkLayoutProps {
  /** The token segment, which is also where the brand lockup links. */
  readonly params: Promise<{ token: string }>
  /** The link page. */
  readonly children: ReactNode
}

/**
 * Every `/s/<token>/*` page's frame: the brand bar linking back to this link's own page, with no
 * Sign out, because a client has no session to end (ADR 0040).
 */
export default async function LinkLayout({ params, children }: LinkLayoutProps) {
  const { token } = await params
  return <LinkFrame home={linkPath(token)}>{children}</LinkFrame>
}
