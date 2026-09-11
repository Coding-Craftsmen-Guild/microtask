'use client'

import { useRef, type MouseEvent } from 'react'
import type { ProgressValue } from '@repo/contracts'
import type { MoveDirection } from './reorder'
import type { TabControls } from './tab-controls'
import { TabCount } from './tab-count'
import { TabMenu } from './tab-menu'
import type { WorkspaceTab } from './workspace-state'

const IDLE =
  'flex shrink-0 items-center gap-1.5 border-b-[2.5px] border-transparent px-3.5 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-deep'

const ACTIVE =
  'flex shrink-0 items-center gap-1.5 border-b-[2.5px] border-gold-deep bg-gold/15 px-3.5 py-2 text-sm font-medium whitespace-nowrap text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-deep'

const titleOf = (name: string, active: boolean, hasMenu: boolean): string | undefined => {
  if (!hasMenu) return undefined
  return active ? 'Tab options' : `Open ${name}`
}

/** What the tab's menu does, bound to this tab by the strip. */
export interface TabMenuHandlers {
  /** Opens the rename prompt for this tab. */
  onRename: () => void
  /** Moves this tab one step. */
  onMove: (direction: MoveDirection) => void
  /** Opens the delete confirmation for this tab. */
  onDelete: () => void
}

/** Props for {@link TabButton}. */
export interface TabButtonProps {
  /** The tab drawn. */
  tab: WorkspaceTab
  /** Its place in the strip. */
  index: number
  /** How many tabs the strip holds. */
  count: number
  /** Whether it is the open tab. */
  active: boolean
  /** Its checklist count, live for the open tab. */
  progress: ProgressValue
  /** What the viewer may do to tabs. */
  controls: TabControls
  /** Whether this tab's menu is open. */
  menuOpen: boolean
  /** Opens this tab. */
  onSelect: () => void
  /** Opens or closes this tab's menu. */
  onMenu: (open: boolean) => void
  /** The menu's items. */
  menu: TabMenuHandlers
}

/**
 * One tab: its name, a `done/total` pill when it has checklist items, and on the open tab a `▾`.
 *
 * Clicking another tab opens it; clicking the open tab opens its menu, and a right-click opens
 * any tab's menu with the browser's own suppressed — legacy's three paths. A viewer with no tab
 * control gets no menu, no caret and no title, and a right-click there is the browser's again.
 *
 */
export function TabButton(props: TabButtonProps) {
  const { tab, active, progress, controls } = props
  const button = useRef<HTMLButtonElement>(null)
  const hasMenu = controls.rename || controls.reorder || controls.remove
  const contextMenu = (event: MouseEvent): void => {
    if (!hasMenu) return
    event.preventDefault()
    props.onMenu(true)
  }
  const click = (): void => {
    if (!active) props.onSelect()
    else if (hasMenu) props.onMenu(true)
  }
  return (
    <div className="relative shrink-0">
      <button
        aria-selected={active}
        className={active ? ACTIVE : IDLE}
        onClick={click}
        onContextMenu={contextMenu}
        ref={button}
        role="tab"
        title={titleOf(tab.name, active, hasMenu)}
        type="button"
      >
        <span>{tab.name}</span>
        <TabCount active={active} progress={progress} />
        {active && hasMenu ? <span aria-hidden="true">▾</span> : null}
      </button>
      {props.menuOpen ? (
        <TabMenu
          controls={controls}
          count={props.count}
          index={props.index}
          onClose={() => props.onMenu(false)}
          onRestoreFocus={() => button.current?.focus()}
          {...props.menu}
        />
      ) : null}
    </div>
  )
}
