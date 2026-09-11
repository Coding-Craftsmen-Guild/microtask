'use client'

import { useEffect, useMemo, useRef } from 'react'
import { countTasks, LIMITS, type ProgressValue } from '@repo/contracts'
import { TabButton } from './tab-button'
import type { MoveDirection } from './reorder'
import type { TabControls } from './tab-controls'
import type { WorkspaceTab } from './workspace-state'

const ADD =
  'shrink-0 px-3 py-1.5 text-[17px] leading-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'

/** Props for {@link TabStrip}. */
export interface TabStripProps {
  /** The tabs, in order. */
  tabs: readonly WorkspaceTab[]
  /** The open tab's id. */
  active: string
  /** The open tab's count as of its last edit, which beats the one its stored document gives. */
  live: ProgressValue | null
  /** What the viewer may do to tabs. */
  controls: TabControls
  /** Whose menu is open, if anyone's. */
  menuFor: string | null
  /** Opens or closes a tab's menu. */
  onMenu: (tabId: string | null) => void
  /** Opens a tab. */
  onSelect: (tabId: string) => void
  /** Opens the new-tab prompt. */
  onCreate: () => void
  /** Opens the rename prompt for a tab. */
  onRename: (tab: WorkspaceTab) => void
  /** Moves a tab one step. */
  onMove: (tab: WorkspaceTab, direction: MoveDirection) => void
  /** Opens the delete confirmation for a tab. */
  onDelete: (tab: WorkspaceTab) => void
}

/**
 * The horizontally scrolling tab strip, with the `+` at its end.
 *
 * **It is never rebuilt.** Each tab is a keyed element React updates in place, so a keystroke —
 * which changes the open tab's pill — patches one text node and the strip keeps its scroll
 * position. Legacy's admin page patched pills in place for this reason; its share page rebuilt
 * the whole strip on every keystroke and threw the scroll away, and that half is not reproduced.
 *
 * The open tab is scrolled into view (`nearest` on both axes) when it changes and when the order
 * does, and never on a keystroke, so a user scrolling the strip while typing is left where they
 * scrolled to.
 *
 * `+` is disabled at `LIMITS.tabsPerTask`, the bound the API enforces, rather than at a number
 * written here.
 */
export function TabStrip(props: TabStripProps) {
  const { tabs, active, live, controls } = props
  const list = useRef<HTMLDivElement>(null)
  const counts = useMemo(() => new Map(tabs.map((tab) => [tab.id, countTasks(tab.document)])), [tabs])
  const order = tabs.map((tab) => tab.id).join(' ')
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, order])
  return (
    <div className="flex items-end overflow-x-auto overflow-y-hidden border-b [scrollbar-width:thin]" data-slot="tab-strip">
      <div aria-label="Tabs" className="flex" ref={list} role="tablist">
        {tabs.map((tab, index) => (
          <TabButton
            active={tab.id === active}
            controls={controls}
            count={tabs.length}
            index={index}
            key={tab.id}
            menu={{
              onRename: () => props.onRename(tab),
              onMove: (direction) => void props.onMove(tab, direction),
              onDelete: () => props.onDelete(tab),
            }}
            menuOpen={props.menuFor === tab.id}
            onMenu={(open) => props.onMenu(open ? tab.id : null)}
            onSelect={() => props.onSelect(tab.id)}
            progress={(tab.id === active ? live : null) ?? counts.get(tab.id) ?? { done: 0, total: 0 }}
            tab={tab}
          />
        ))}
      </div>
      {controls.create ? (
        <button
          aria-label="New tab"
          className={ADD}
          disabled={tabs.length >= LIMITS.tabsPerTask}
          onClick={props.onCreate}
          title="New tab"
          type="button"
        >
          +
        </button>
      ) : null}
    </div>
  )
}
