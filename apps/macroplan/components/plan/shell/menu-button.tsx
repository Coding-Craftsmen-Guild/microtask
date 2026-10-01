import type { ReactNode } from 'react'
import { MENU } from './shell-css'

/** Props for {@link MenuButton}. */
export interface MenuButtonProps {
  /** What the button says, which is also what the panel is about. */
  readonly label: string

  /** `primary` is the one action a reader came to take; `quiet` is everything else. */
  readonly tone: 'primary' | 'quiet'

  /** The `data-slot` the panel carries, so a test reaches this menu and not the one beside it. */
  readonly slot: string

  /** What is inside the panel. */
  readonly children: ReactNode
}

/**
 * A button in the head row that opens a panel beneath itself, with no JavaScript at all.
 *
 * ### Why `<details>` and not a popover
 *
 * The browser already has a disclosure, it needs no island, it survives every re-render the plan
 * does on its own, and it works with scripting off — which is the rule this page applies to the
 * view switch, the group chips and the table's column menu. A Radix popover would buy collision
 * handling and an Escape key for a panel that opens 400px under a 28px button at the end of a row,
 * which is a place nothing collides with.
 *
 * What it does **not** buy is dismissal on an outside click, and that is a real cost rather than an
 * oversight: this closes when its own summary is pressed again, or when focus leaves it and the
 * reader presses it, and nothing else dismisses it. It is accepted here because the panel covers
 * chrome rather than the board, and because the alternative is a client component holding open
 * state for a form that is otherwise entirely server-rendered.
 *
 * Share is the exception and says so in its own file: its panel may not be in the DOM before it is
 * opened, because what loads into it is a list of live credentials.
 */
export function MenuButton({ label, tone, slot, children }: MenuButtonProps) {
  return (
    <details className={MENU.root} data-slot={slot}>
      <summary className={tone === 'primary' ? MENU.openerPrimary : MENU.openerQuiet}>
        {label}
      </summary>
      <div className={MENU.panel} data-slot={`${slot}-panel`}>
        <div className={MENU.body}>{children}</div>
      </div>
    </details>
  )
}
