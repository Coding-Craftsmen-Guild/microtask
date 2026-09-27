import type { Metadata } from 'next'
import { readShare } from './read-share'

const TITLE = 'Shared plan · CC Guild Macroplan'

/** Props for {@link LinkPlanPage} and {@link generateMetadata}, which Next supplies. */
export interface LinkPageProps {
  readonly params: Promise<{ readonly token: string }>
}

/** The tab title, from the seat bootstrap and never from a plan read. */
export async function generateMetadata({ params }: LinkPageProps): Promise<Metadata> {
  const share = await readShare((await params).token)
  return { title: share.ok ? `${share.value.plan.name} · CC Guild Macroplan` : TITLE }
}

/**
 * The seat surface with no drawer open, which is nothing at all.
 *
 * It used to render a paragraph explaining that a feature and an item each have their own address
 * and that whatever is on screen can be linked to, reloaded and stepped back out of. That is a note
 * about how the routing was built, written for whoever built it, and it was on screen under the plan
 * for every holder of every link. A reader who has opened nothing needs to be told nothing; the
 * admin surface's own page has always returned `null` here, and this is the twin of it.
 */
export default function LinkPlanPage() {
  return null
}
