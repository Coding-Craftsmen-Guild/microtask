import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  confirmImport,
  expandImportArchive,
  openImportSession,
  previewImport,
} from '../../../actions/transfer'
import { ExportPanel } from '../../../components/transfer/export-panel'
import { TransferConsole } from '../../../components/transfer/transfer-console'
import { TRANSFER_PAGE_PATH } from '../../../components/transfer/paths'
import { apiForSession } from '../../../lib/api'
import { loginPathFor } from '../../../lib/next-path'

const PAGE = 'grid gap-8 pt-6'
const HEADING = 'text-[15px] font-semibold'

/** The tab title, named for what the page does rather than for the phase that built it. */
export const metadata = { title: 'Export and import · CC Guild Microtask' } satisfies Metadata

/**
 * `/transfer`: download the workspace, or drop a folder and import it.
 *
 * **Admin-only, and unreachable from `/s/*`.** It sits in the `(admin)` group, so `proxy.ts`
 * sends any navigation here without an `mt_admin` that opens to `/login?next=/transfer` — and a
 * cookie holding a **link** principal is one that does not open as an admin, because `adminFrom`
 * checks `kind`. There is no `/s/*` address for this page at all: the client surface's whole
 * route tree is `/s/[token]` and its task pages, and a share link confers authority over one
 * project or one task, never over adding projects to a workspace (ADR 0009, ADR 0040).
 *
 * The session is read here as well, and a browser without one is redirected rather than shown an
 * empty console. That is not a second gate so much as the one the *page* owes: `proxy.ts` matches
 * on the path and this checks the cookie opens, and a page that rendered a drop zone to someone
 * who cannot open a session would answer their first drop with a redirect mid-upload.
 *
 * The four actions are passed down rather than imported by the island, so the client component is
 * drivable by a test with no action machinery and the authority stays in the actions.
 */
export default async function TransferPage() {
  if ((await apiForSession('admin')) === null) redirect(loginPathFor(TRANSFER_PAGE_PATH))
  return (
    <div className={PAGE}>
      <section>
        <h2 className={HEADING}>Export</h2>
        <ExportPanel />
      </section>
      <section>
        <h2 className={HEADING}>Import</h2>
        <TransferConsole
          onConfirm={confirmImport}
          onExpand={expandImportArchive}
          onOpen={openImportSession}
          onPreview={previewImport}
        />
      </section>
    </div>
  )
}
