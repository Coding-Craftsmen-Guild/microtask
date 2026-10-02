import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { PANEL, PANEL_HEIGHT, PANEL_SIZE, TAB, TAB_MARK } from './panel-css'
import { PanelGrip } from './panel-grip'

/** The id the panel's heading carries, so the panel can name itself by it. */
export const TITLE_ID = 'plan-drawer-title'

const CLOSE_MARK = String.fromCharCode(0x2715)

/** Every sentence the panel's own chrome says, in one record. */
export const PANEL_WORDS = {
  close: 'Close',
  resize: 'Drag to resize the panel, or use the arrow keys',
  hint: 'Hover a mark for a summary · click one to open it here',
} as const

const heightStyle = (): CSSProperties =>
  ({ height: `var(${PANEL_HEIGHT}, ${String(PANEL_SIZE.open)}px)` }) as CSSProperties

/** Props for {@link DrawerDock}. */
export interface DrawerDockProps {
  /** The one tab in the strip. */
  readonly tab: ReactNode

  /**
   * What sits beside the tab: an action about the whole subject rather than a value of it.
   *
   * Delete, and nothing else so far. It is here rather than among the fields because that is what it
   * is, and because a destructive button at the foot of a column of inputs is a destructive button in
   * tab order after every one of them.
   */
  readonly tools?: ReactNode

  /** Everything under the strip. */
  readonly children: ReactNode
}

/**
 * The panel every drawer route opens in: a grip, a tab strip, and a body that scrolls under both.
 *
 * ### What this replaced, and why
 *
 * A 28rem dock `fixed` to the right-hand edge behind a scrim. `./panel-css.ts` carries the whole
 * argument; the short of it is that the dock covered the bars a reader had just clicked, the scrim
 * said *finish here first* about a page whose point is that a plan is read while it is changed, and
 * 28rem is a column, so a form about one feature was eight fields stacked in a strip narrower than
 * the rail names. Under the board the board **shrinks**, the form has the page's width, and nothing
 * is dimmed because nothing is blocked.
 *
 * ### The height is an inline `var()` with a fallback
 *
 * So the panel opens at 360px with no JavaScript at all, and a reader who has dragged it gets their
 * own height the moment `PanelGrip` restores the property. A class cannot do this: the value is a
 * custom property Tailwind's scanner has nothing to emit for, and the fallback has to be in the same
 * declaration or a first paint before hydration would be a panel of zero height.
 *
 * ### Still a route, still no dialog
 *
 * It claims no `role="dialog"` and traps no focus, because it is neither: it is a **route**, and the
 * thing that closes it is a `Link` back to the plan's own path (ADR 0057). Back, a bookmark and the
 * tab's own `✕` therefore all mean one thing, and none of them needs JavaScript. What left with the
 * scrim is clicking away to close — deliberately, because there is no longer anything to click away
 * *from*: the board beside it is live, and a click on it opens whatever was clicked.
 */
export function DrawerDock({ tab, tools = null, children }: DrawerDockProps) {
  return (
    <aside
      aria-labelledby={TITLE_ID}
      className={PANEL.dock}
      data-slot="drawer-shell"
      style={heightStyle()}
    >
      <PanelGrip label={PANEL_WORDS.resize} />
      <div className={PANEL.strip} data-slot="panel-tabs">
        {tab}
        {tools}
        <p className={PANEL.hint}>{PANEL_WORDS.hint}</p>
      </div>
      <div className={PANEL.body}>{children}</div>
    </aside>
  )
}

/** Props for {@link PanelTab}. */
export interface PanelTabProps {
  /** What kind of thing is open, which decides the marker and the eyebrow. */
  readonly kind: 'feature' | 'item'

  /** What it is called. */
  readonly title: string

  /** Its own hue, so the tab can be matched to the mark it opened. `''` draws a grey marker. */
  readonly colour: string

  readonly closeHref: string
}

/**
 * The one tab in the strip: a marker in the subject's hue, what kind it is, its name, and the way out.
 *
 * The heading is the **name**, and it carries {@link TITLE_ID} so the panel is named by what is open
 * rather than by the word `Panel`. It is an `<h2>` inside a tab, which is unusual and is right: a tab
 * strip holding one tab is a heading with a close button beside it, and a reader jumping to the
 * landmark should hear the feature's name.
 *
 * The close is last in the row and first in nothing: it is a `Link` to the plan's own path, so it is
 * reached by Tab in the order it is drawn and does the same thing Back does.
 */
export function PanelTab({ kind, title, colour, closeHref }: PanelTabProps) {
  return (
    <div className={TAB.open} data-slot="panel-tab">
      <span
        className={TAB_MARK[kind]}
        data-slot="tab-marker"
        style={colour === '' ? undefined : { backgroundColor: kind === 'feature' ? colour : undefined, borderColor: colour }}
      />
      <span className={TAB.kind}>{kind === 'feature' ? 'Feature' : 'Item'}</span>
      <h2 className={TAB.name} id={TITLE_ID} title={title}>
        {title}
      </h2>
      <Link aria-label={PANEL_WORDS.close} className={TAB.close} href={closeHref}>
        {CLOSE_MARK}
      </Link>
    </div>
  )
}

/** Props for {@link PlainTab}, the strip's shape for a route that is not a feature or an item. */
export interface PlainTabProps {
  /** What kind of thing is open — `Rail`, `Group`, `New rail` — or nothing where the title says it. */
  readonly kind: string | null

  readonly title: string

  readonly closeHref: string
}

/**
 * The tab a rail, a group or a make-one form opens in.
 *
 * It carries no marker, because those routes are not marks on the board: there is no hue to match a
 * rail's form to, the rail's own row in the column beside the board is already its colour, and a
 * grey dot would be a channel saying nothing. Everything else about it is {@link PanelTab} — the same
 * shape, the same heading id, the same way out — which is what keeps six routes opening in one panel
 * rather than in two that drift.
 */
export function PlainTab({ kind, title, closeHref }: PlainTabProps) {
  return (
    <div className={TAB.open} data-slot="panel-tab">
      {kind === null ? null : <span className={TAB.kind}>{kind}</span>}
      <h2 className={TAB.name} id={TITLE_ID} title={title}>
        {title}
      </h2>
      <Link aria-label={PANEL_WORDS.close} className={TAB.close} href={closeHref}>
        {CLOSE_MARK}
      </Link>
    </div>
  )
}
