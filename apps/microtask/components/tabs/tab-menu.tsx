'use client'

import { useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import type { MoveDirection } from './reorder'
import type { TabControls } from './tab-controls'

/** Props for {@link TabMenu}. */
export interface TabMenuProps {
  /** Where the tab sits, which disables Move left at the first and Move right at the last. */
  index: number
  /** How many tabs the task has; Delete tab is disabled at one. */
  count: number
  /** Which of the three groups to draw at all. */
  controls: TabControls
  /** Closes the menu. */
  onClose: () => void
  /** Returns focus to the tab when the menu closes without handing it to a dialog. */
  onRestoreFocus: () => void
  /** Opens the rename prompt. */
  onRename: () => void
  /** Moves the tab one step. */
  onMove: (direction: MoveDirection) => void
  /** Opens the delete confirmation. */
  onDelete: () => void
}

/**
 * Legacy's tab options menu: Rename · Move left · Move right · — · Delete tab.
 *
 * Mounted open and anchored on a zero-size trigger inside the tab, so the tab button keeps its
 * own click — select when inactive, this menu when active — rather than Radix's pointer-down
 * trigger deciding. Each group is drawn only where a capability allows it (ADR 0038), and the
 * disabled states are legacy's: nothing to the left of the first tab, nothing to the right of the
 * last, and no deleting a task's only tab.
 *
 * Focus returns to the tab on a plain close, and is left alone when an item hands it to a dialog:
 * the dialog focuses its own input, and a menu restoring focus behind it would take it back.
 */
export function TabMenu(props: TabMenuProps) {
  const handedOff = useRef(false)
  const handOff = (open: () => void) => () => {
    handedOff.current = true
    open()
  }
  return (
    <DropdownMenu onOpenChange={(open) => (open ? undefined : props.onClose())} open>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="absolute bottom-0 left-0 size-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!handedOff.current) props.onRestoreFocus()
        }}
      >
        {props.controls.rename ? <DropdownMenuItem onSelect={handOff(props.onRename)}>Rename</DropdownMenuItem> : null}
        {props.controls.reorder ? (
          <>
            <DropdownMenuItem disabled={props.index === 0} onSelect={() => props.onMove('left')}>
              Move left
            </DropdownMenuItem>
            <DropdownMenuItem disabled={props.index === props.count - 1} onSelect={() => props.onMove('right')}>
              Move right
            </DropdownMenuItem>
          </>
        ) : null}
        {props.controls.remove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={props.count <= 1} onSelect={handOff(props.onDelete)} variant="destructive">
              Delete tab
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
