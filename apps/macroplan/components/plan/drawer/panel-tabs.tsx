import Link from 'next/link'
import { TITLE_ID } from './drawer-dock'
import { TAB, TAB_MARK } from './panel-css'
import type { TabView } from './tab-view'

const CLOSE_MARK = String.fromCharCode(0x2715)

const KINDS: Readonly<Record<'feature' | 'item', string>> = { feature: 'Feature', item: 'Item' }

/** What a tab's close is called, which is the one word that is not the subject's name. */
export const TAB_WORDS = { close: 'Close', closeOne: 'Close tab' } as const

const markStyle = (tab: TabView) =>
  tab.colour === ''
    ? undefined
    : { backgroundColor: tab.kind === 'feature' ? tab.colour : undefined, borderColor: tab.colour }

/** Props for {@link PanelTabs}. */
export interface PanelTabsProps {
  /** Every open tab, in order, with the active one marked (`./tab-view.ts`). */
  readonly tabs: readonly TabView[]
}

/**
 * The strip: one tab per subject a reader has opened, the active one at the front of the stack.
 *
 * ### Why there is more than one
 *
 * Comparing two features is the ordinary thing to do with a plan, and a panel that held one subject made
 * it a navigation each way: open this, read it, open that, read it, open this again. The tabs are a URL
 * (`?open=f:…,i:…`) rather than component state, so a stack survives a reload and can be sent to somebody
 * — and the **active** tab stays the route, so a link to one subject still opens exactly that subject
 * whatever else is in the stack (`./tab-stack.ts`).
 *
 * ### What each tab is
 *
 * The active one is white with no bottom border, pulled down a pixel so it overlaps the strip's own rule:
 * the shape every browser and every editor draws a front tab with, which says *this panel is showing this
 * one*. The others are flat links. Each carries the subject's hue as a marker and its kind as a word, so
 * a tab can be matched to the mark it came from without reading the name.
 *
 * The `<h2>` carrying {@link TITLE_ID} is on the **active** tab alone, because that is the panel's own
 * name: a reader jumping to the landmark hears what is open, not a list of what else is.
 */
export function PanelTabs({ tabs }: PanelTabsProps) {
  return (
    <>
      {tabs.map((tab) => (
        <div className={tab.active ? TAB.open : TAB.shut} data-slot="panel-tab" key={tab.id}>
          <span className={TAB_MARK[tab.kind]} data-slot="tab-marker" style={markStyle(tab)} />
          <span className={TAB.kind}>{KINDS[tab.kind]}</span>
          {tab.active ? (
            <h2 className={TAB.name} id={TITLE_ID} title={tab.name}>
              {tab.name}
            </h2>
          ) : (
            <Link className={TAB.shutName} href={tab.href} title={tab.name}>
              {tab.name}
            </Link>
          )}
          <Link
            aria-label={tab.active ? TAB_WORDS.close : `${TAB_WORDS.closeOne}: ${tab.name}`}
            className={TAB.close}
            href={tab.closeHref}
          >
            {CLOSE_MARK}
          </Link>
        </div>
      ))}
    </>
  )
}
