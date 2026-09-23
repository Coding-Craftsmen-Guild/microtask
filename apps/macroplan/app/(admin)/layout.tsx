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
 *
 * `width="wide"` because this surface's own page is a timeline. A layout cannot see which page it is
 * wrapping, so the choice is made once for the surface and the one page that wants legacy's 900px
 * column — the plan list — caps itself; the alternative was moving `Page` out of the layout and into
 * every page, which would put the brand bar's frame and the page column in two different places and
 * diverge from `apps/microtask`, where both live in the layout. `Page` still renders the `main`
 * landmark at either width, which is what `layout.test.tsx` asserts here, and it supplies no
 * `overflow-x` at either — a canvas wider than the viewport brings its own scroller (`PlanScreen`).
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AppBar logo={<Logo size="bar" />} product="Macroplan">
        <SignOutForm />
      </AppBar>
      <Page width="wide">{children}</Page>
    </>
  )
}
