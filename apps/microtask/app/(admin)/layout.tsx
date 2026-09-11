import { AppBar } from '@repo/ui/shell/app-bar'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'
import { Logo } from '../../components/shared/logo'
import { SignOutForm } from '../../components/shared/sign-out-form'

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
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AppBar logo={<Logo size="bar" />} product="Microtask">
        <SignOutForm />
      </AppBar>
      <Page>{children}</Page>
    </>
  )
}
