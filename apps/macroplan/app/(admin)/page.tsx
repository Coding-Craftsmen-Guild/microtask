import { EmptyState } from '@repo/ui/shell/empty-state'
import type { Metadata } from 'next'

/** The tab title this page gives the browser. */
export const metadata = { title: 'Macroplan · CC Guild' } satisfies Metadata

/**
 * `/`: the admin's landing page, which has nothing to list yet.
 *
 * It reads nothing, and that is deliberate rather than unfinished: Macroplan's entities are not
 * specified, and `/v1/macroplan/*` is reserved and empty (ADR 0014). A page that called the API
 * for a collection that does not exist would render a 404 as if something had gone wrong.
 *
 * What it does prove is the whole seam this app was built to prove: an admin signed in against
 * the product-agnostic `/v1/auth/login` with this app's own service key, `mp_admin` sealed and
 * read back, `proxy.ts` gating this route, and the shared shell drawn around it. The first
 * entity replaces the empty state and changes nothing else on this page.
 */
export default function MacroplanPage() {
  return (
    <div className="grid gap-4 pt-6">
      <EmptyState>Nothing here yet — Macroplan has no plans of its own.</EmptyState>
    </div>
  )
}
