'use client'

import { useState } from 'react'
import { STRIP } from './create-css'
import { CreateGlyph } from './create-glyph'
import {
  CREATE_HINTS,
  CREATE_KINDS,
  CREATE_WORDS,
  dragTypeOf,
  type CreateKind,
} from './create-kinds'

/** Props for {@link CreateStrip}. */
export interface CreateStripProps {
  /** Whether a rail may be added, which is the first pill. */
  readonly mayAddEpic: boolean

  /** Whether a feature may be added. */
  readonly mayAddFeature: boolean

  /** Whether an item may be added. */
  readonly mayAddItem: boolean
}

/**
 * The strip over the board: what can be added, as pills that are dragged onto it.
 *
 * ### Why a drag and not three buttons
 *
 * Three buttons would make three things with no say in **where** they land — a rail at the bottom, a
 * feature at the end of some rail, an item at the end of some feature. The board is a picture of
 * where everything is, so the gesture that puts something on it should be aimed at the place it goes,
 * which is what a drag is and what a button cannot be. `./create-root.tsx` is what catches them.
 *
 * ### Why it holds its own state, and what for
 *
 * One thing: which pill is in the pointer, so the hint can say where **that kind** lands before the
 * reader has aimed. That is the whole reason the hint is worth having, and it is also why this is a
 * client component rather than server markup — there is no way to say it from the server, because it
 * is a sentence about a gesture in progress. The drop root beside it keeps no copy: it reads the kind
 * off `dataTransfer.types`, which is the only thing the platform offers during a drag.
 *
 * ### Why the pills are `<button>` and not `<div draggable>`
 *
 * A div is not a tab stop and says nothing to a screen reader. A button is both, and the drag rides
 * on top of it. What a **press** does is nothing, deliberately: a press has no target, and a control
 * that made a rail at the bottom of the plan when pressed and at the pointer when dragged would be
 * two different controls wearing one label. The keyboard path to the same three writes is the rail
 * drawer's own add, the table's toolbar, and the drawer's item list — each of which names where the
 * thing will go.
 */
export function CreateStrip({ mayAddEpic, mayAddFeature, mayAddItem }: CreateStripProps) {
  const [held, setHeld] = useState<CreateKind | null>(null)
  const offered: Readonly<Record<CreateKind, boolean>> = {
    epic: mayAddEpic,
    feature: mayAddFeature,
    item: mayAddItem,
  }
  return (
    <div className={STRIP.row} data-slot="create-strip">
      <span className={STRIP.label}>{CREATE_WORDS.add}</span>
      {CREATE_KINDS.filter((kind) => offered[kind]).map((kind) => (
        <button
          className={STRIP.pill}
          data-slot={`add-${kind}`}
          draggable
          key={kind}
          onDragEnd={() => setHeld(null)}
          onDragStart={(event) => {
            event.dataTransfer.setData(dragTypeOf(kind), kind)
            event.dataTransfer.effectAllowed = 'copy'
            setHeld(kind)
          }}
          type="button"
        >
          <CreateGlyph kind={kind} />
          {CREATE_WORDS[kind]}
        </button>
      ))}
      <span aria-hidden="true" className={STRIP.divider} />
      <p className={STRIP.hint} data-slot="create-hint" role="status">
        {CREATE_HINTS[held ?? 'idle']}
      </p>
    </div>
  )
}
