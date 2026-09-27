import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The panel that slides in from the right, and the page behind it.
 *
 * ### What was missing
 *
 * The first revision's dock was `fixed inset-y-0 right-0 z-40 … border-l bg-card p-4 shadow-xl` and
 * nothing else: no scrim, no header bar, no close control but a text link at the very bottom, past
 * however many fields the subject had. It overlapped the app bar, the page behind it stayed fully
 * lit and fully scrollable, and on a long drawer the only way out was to scroll to find it.
 *
 * ### The scrim is a link
 *
 * Clicking away from a drawer closes it, and here that is an anchor to the plan's own URL covering
 * the page — no client component, no listener, and it works with JavaScript disabled. It is
 * `aria-hidden` and not focusable, because the close control in the header is the accessible way out
 * and a second unlabelled tab stop over the whole page is worse than none.
 */
export const DRAWER = {
  scrim: 'fixed inset-0 z-30 bg-foreground/25',
  dock: 'fixed inset-y-0 right-0 z-40 flex w-[min(28rem,100vw)] flex-col border-l border-border bg-background shadow-2xl',
  head: 'flex shrink-0 items-start gap-2 border-b border-border px-4 py-3',
  kind: 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
  title: 'text-[15px] leading-snug font-semibold',
  close:
    'shrink-0 rounded-md px-1.5 py-0.5 text-[16px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
  body: 'grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4',
} as const

/** The id the dock's heading carries, so the panel can name itself by it. */
export const TITLE_ID = 'plan-drawer-title'

const CLOSE_MARK = '✕'

const CLOSE_LABEL = 'Close'

/** Props for {@link DrawerScrim}. */
export interface DrawerScrimProps {
  readonly closeHref: string
}

/** The dimmed page behind the drawer, which closes it when clicked. */
export function DrawerScrim({ closeHref }: DrawerScrimProps) {
  return <Link aria-hidden="true" className={DRAWER.scrim} href={closeHref} tabIndex={-1} />
}

/** Props for {@link DrawerHead}. */
export interface DrawerHeadProps {
  /** What kind of thing is open — `Feature`, `Item`, `Rail` — or nothing where the title says it. */
  readonly kind: string | null

  readonly title: string

  readonly closeHref: string
}

/**
 * The drawer's own title bar: what is open, and the way out.
 *
 * The close control is first in the drawer's tab order and last in its visual row, which is where a
 * reader looks for it and where a keyboard reaches it soonest.
 */
export function DrawerHead({ kind, title, closeHref }: DrawerHeadProps) {
  return (
    <div className={DRAWER.head}>
      <div className="min-w-0 flex-1">
        {kind === null ? null : <p className={DRAWER.kind}>{kind}</p>}
        <h2 className={DRAWER.title} id={TITLE_ID}>
          {title}
        </h2>
      </div>
      <Link aria-label={CLOSE_LABEL} className={DRAWER.close} href={closeHref}>
        {CLOSE_MARK}
      </Link>
    </div>
  )
}

/** Props for {@link DrawerBody}. */
export interface DrawerBodyProps {
  readonly children: ReactNode
}

/** Everything under the title bar, scrolling on its own so the bar stays put. */
export function DrawerBody({ children }: DrawerBodyProps) {
  return <div className={DRAWER.body}>{children}</div>
}
