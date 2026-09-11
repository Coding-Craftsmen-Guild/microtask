'use client'

import { Button } from '@repo/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu'
import { Fragment } from 'react'

/** One item in an options menu. */
export interface MenuEntry {
  /** What it says. */
  readonly label: string
  /** What it does. */
  readonly onSelect: () => void
  /** Whether it is drawn but cannot be chosen, such as Move up on the first row. */
  readonly disabled?: boolean
  /** Whether it destroys something, which paints it red below a separator. */
  readonly danger?: boolean
}

/** Props for {@link OptionsMenu}. */
export interface OptionsMenuProps {
  /** The trigger's accessible name, such as `Task options`. */
  label: string
  /** The items, already filtered to the ones `controls` allows. */
  items: readonly MenuEntry[]
}

/**
 * The `⋯` menu every row carries, drawn only when it has something in it.
 *
 * Non-modal, and it does not hand focus back to its trigger on close: an item that opens a
 * rename field or a dialog has just moved focus somewhere on purpose, and a menu that took it
 * back would blur the field it opened — committing an empty edit — or pull focus out of a dialog.
 */
export function OptionsMenu({ label, items }: OptionsMenuProps) {
  if (items.length === 0) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={label} size="icon-sm" type="button" variant="ghost">
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.danger === true ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled ?? false}
              onSelect={item.onSelect}
              variant={item.danger === true ? 'destructive' : 'default'}
            >
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
