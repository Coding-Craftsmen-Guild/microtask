import { AppBar } from '@repo/ui/shell/app-bar'
import { Logo } from '@repo/ui/shell/logo'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'
import { SignOutForm } from '../../components/shared/sign-out-form'

/** Props for {@link AdminLayout}. */
export interface AdminLayoutProps {
  /** The admin page. */
  readonly children: ReactNode

  /**
   * The brand bar's breadcrumb, filled by the `@crumbs` parallel route.
   *
   * A slot and not a prop because a layout cannot be handed one by its children, and the trail's
   * last step is a plan's own name — read two segments below this (`./plan-crumb.tsx`). Optional so
   * that this component still renders in a test that mounts it directly, where there is no router
   * to fill a slot and `undefined` is what arrives.
   */
  readonly crumbs?: ReactNode
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
 * It does carry a **breadcrumb**, and it arrives through the `@crumbs` slot rather than as a prop
 * — `./plan-crumb.tsx` carries why that is the only direction the fact can travel. Off the plan
 * tree the slot draws nothing and the bar is what it was.
 *
 * `width="wide"` because this surface's own page is a timeline. A layout cannot see which page it is
 * wrapping, so the choice is made once for the surface and the one page that wants legacy's 900px
 * column — the plan list — caps itself; the alternative was moving `Page` out of the layout and into
 * every page, which would put the brand bar's frame and the page column in two different places and
 * diverge from `apps/microtask`, where both live in the layout. `Page` still renders the `main`
 * landmark at either width, which is what `layout.test.tsx` asserts here, and it supplies no
 * `overflow-x` at either — a canvas wider than the viewport brings its own scroller (`PlanScreen`).
 */
export default function AdminLayout({ children, crumbs }: AdminLayoutProps) {
  return (
    <div className="flex h-dvh flex-col">
      <AppBar crumbs={crumbs} logo={<Logo size="bar" />} product="Macroplan" width="wide">
        <SignOutForm />
      </AppBar>
      <Page width="full">{children}</Page>
    </div>
  )
}
