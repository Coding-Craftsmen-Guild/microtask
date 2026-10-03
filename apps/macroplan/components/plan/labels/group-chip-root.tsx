'use client'

import { usePlanNav } from '../nav/plan-nav'
import type { ReactNode } from 'react'

const CHIP = '[data-slot="group-chip"]'

/** Props for {@link GroupChipRoot}. */
export interface GroupChipRootProps {
  /**
   * The plan whose group drawers this opens.
   *
   * A string, which is the only shape a client component under `components/plan` may be handed —
   * `module-boundaries.test.tsx` admits primitives, unbound functions and markup on `children`, and
   * nothing else. The path is built here from that id rather than passed as a function, so no part of
   * the plan crosses the boundary to reach a URL.
   */
  readonly planId: string

  /** The server-rendered chips, untouched. */
  readonly children: ReactNode
}

/**
 * One delegation root over the server-rendered chips, so a double click opens a group.
 *
 * ### Why a root and not a handler per chip
 *
 * The same shape, and for the same reasons, as `canvas/drag-root.tsx` (ADR 0058): the chips are a
 * Server Component holding a native radio group, and making each one an island would hydrate a
 * control whose entire behaviour the browser already provides. This wraps them and resolves which
 * chip was hit with `closest()`, so what was double-clicked comes out of the markup — `data-label-id`
 * on the chip — rather than out of a closure per row.
 *
 * It is handed the chips on `children`, which is the one prop the boundary sweep admits markup on.
 *
 * ### Why the single click is left alone
 *
 * A chip is a `<label>` for its radio, and that is what makes selecting a group cost no JavaScript,
 * no state and no round trip (ADR 0064). Nothing here touches `click`, so that still holds — this
 * listens for `dblclick` only, and a double click fires two `click`s first. So the radio ends up
 * checked and the drawer opens over the selection it just made, which is the right order: you see
 * what is in the group behind the panel that edits it.
 *
 * `preventDefault` is not called. There is nothing to prevent — the label's default is to check its
 * own radio, which already happened on the clicks before this, and suppressing it would make a double
 * click *deselect* what a single click selected.
 */
export function GroupChipRoot({ planId, children }: GroupChipRootProps) {
  const { go } = usePlanNav()
  return (
    <div
      data-slot="group-chip-root"
      onDoubleClick={(event) => {
        const chip = event.target instanceof Element ? event.target.closest(CHIP) : null
        const labelId = chip?.getAttribute('data-label-id')
        if (labelId === null || labelId === undefined) return
        go(`/plans/${encodeURIComponent(planId)}/g/${encodeURIComponent(labelId)}`)
      }}
    >
      {children}
    </div>
  )
}
