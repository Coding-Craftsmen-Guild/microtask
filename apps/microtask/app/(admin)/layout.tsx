import { AppBar } from '@repo/ui/shell/app-bar'
import { Page } from '@repo/ui/shell/page'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@repo/ui/shell/logo'
import { SignOutForm } from '../../components/shared/sign-out-form'

const BAR_LINK = 'text-[13px] text-white/80 hover:text-white'

/** Props for {@link AdminLayout}. */
export interface AdminLayoutProps {
  /** The admin page. */
  readonly children: ReactNode
}

/**
 * The admin surface's frame: the brand bar with Sign out, and the page column.
 *
 * Sign out is a form posting to the `signOut` action, never a link, guarded against a sign-out
 * that gets no answer (`SignOutForm`). It is on every admin page rather than on the index alone,
 * as it was: the app being replaced made an admin walk back to `/` to sign out.
 *
 * **Import / Export is here because otherwise it is nowhere.** `/transfer` shipped with no route
 * into it — the plan specified the page, the handlers and the panel, and specified no way to reach
 * any of them, so the only way in was to type the address. A feature an admin cannot find is one
 * that was not delivered, whatever its tests say. A `Link` rather than a form, unlike Sign out,
 * because navigating changes nothing and Next's prefetch of an admin-gated `GET` is harmless.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AppBar logo={<Logo size="bar" />} product="Microtask">
        <Link className={BAR_LINK} href="/transfer">
          Import / Export
        </Link>
        <SignOutForm />
      </AppBar>
      <Page>{children}</Page>
    </>
  )
}
