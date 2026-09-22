import { AppBar } from '@repo/ui/shell/app-bar'
import { Logo } from '@repo/ui/shell/logo'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'
import { SignOutForm } from '../../components/shared/sign-out-form'

/** Props for {@link AdminLayout}. */
export interface AdminLayoutProps {
  /** The admin page. */
  readonly children: ReactNode
}

/**
 * The admin surface's frame: the brand bar with Sign out, and the page column.
 *
 * The same `AppBar` Microtask renders, under the same mark, with `product` naming this one —
 * which is what the bar took a `product` prop for before a second app existed to pass it.
 *
 * Sign out is a form posting the `signOut` action, never a link, guarded against a sign-out that
 * gets no answer (`SignOutForm`). It is on every admin page rather than on the index alone,
 * because an admin should never have to walk back to `/` to end a session.
 *
 * The bar carries no other action yet. Microtask's Import / Export link is its own; this app has
 * nothing to import until it has entities, and a link to a page that does not exist is worse than
 * no link.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AppBar logo={<Logo size="bar" />} product="Macroplan">
        <SignOutForm />
      </AppBar>
      <Page>{children}</Page>
    </>
  )
}
