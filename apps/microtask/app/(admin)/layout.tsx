import { AppBar } from '@repo/ui/shell/app-bar'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'
import { signOut } from '../../actions/auth'

/** Props for {@link AdminLayout}. */
export interface AdminLayoutProps {
  /** The admin page. */
  readonly children: ReactNode
}

/**
 * The admin surface's frame: the brand bar with Sign out, and the page column.
 *
 * Sign out is a form posting to the `signOut` action, never a link: a link to `/login` would be a
 * GET that a prefetch could follow, and `proxy.ts` clears `mt_admin` on every navigation to
 * `/login`. It is on every admin page rather than on the index alone, as it was — the app being
 * replaced made an admin walk back to `/` to sign out.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AppBar product="Microtask">
        <form action={signOut}>
          <button className="cursor-pointer text-[13px] text-white/80 hover:text-white" type="submit">
            Sign out
          </button>
        </form>
      </AppBar>
      <Page>{children}</Page>
    </>
  )
}
