'use client'

import { LIMITS } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'

const ROW = 'flex flex-wrap items-center gap-2'

const INPUT = 'h-8 w-[18ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

const ORDER = 'h-8 w-[5ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

const SWATCH = 'size-8 cursor-pointer rounded-md border border-input bg-transparent'

const DOT = 'inline-block size-3 rounded-full'

/** What the lane field is called, and how a delete words what it would take with it. */
export const RAIL_FIELD_WORDS = { remove: 'Delete rail', order: 'Lane' } as const

/**
 * What deleting this rail would take with it, said in the button rather than behind a dialog.
 *
 * `Delete rail · 9 features` is a sentence somebody stops at, where `Delete` is one they click. Removing
 * a rail cascades to its features and their items in one write — the widest destructive write on this
 * surface — and a count is what separates "remove this empty lane I made by mistake" from that.
 */
export const deleteWords = (features: number): string =>
  features === 0 ? RAIL_FIELD_WORDS.remove : `${RAIL_FIELD_WORDS.remove} · ${String(features)} features`

/** Props for {@link RailFields}. */
export interface RailFieldsProps {
  /** The rail's stored name, which also labels every control so each reads as this rail's. */
  readonly name: string

  /** The name as typed so far. Controlled, because a refused rename puts the stored one back. */
  readonly typed: string

  /** Its colour as stored. */
  readonly colour: string

  /** Where it sits now, 0-based. */
  readonly railOrder: number

  /** How many features are on it. */
  readonly features: number

  /**
   * Whether the name is editable — `renameEpic`. A reader without it is shown the name as **text**.
   *
   * Shown rather than hidden, which is the one place this panel departs from "an absent control rather
   * than a disabled one": a row with no name is a row about nothing. `epic:create` and `epic:rename` are
   * different actions, so a reader who may add a rail and not rename one is a real principal, and the
   * panel is opened on the first of those.
   */
  readonly mayRename: boolean

  /** Whether the hue is editable — `recolourEpic`, the same `epic:rename` authority drawn separately. */
  readonly mayRecolour: boolean
  /** Whether the lane field is drawn — `epic:reorder` is its own gate, not `epic:rename`. */
  readonly mayReorder: boolean

  /** Whether the delete is drawn. */
  readonly mayRemove: boolean

  /** Called on each keystroke in the name. */
  readonly onName: (value: string) => void

  /** Called when the name loses focus, which is when one rename is one request. */
  readonly onCommit: () => void

  /** Called with a new `#rrggbb`. */
  readonly onColour: (value: string) => void

  /** Called with the lane typed, as a string, because an incomplete number is not one. */
  readonly onOrder: (value: string) => void

  /** Called to delete the rail and everything on it. */
  readonly onRemove: () => void
}

/**
 * The four controls one rail is edited by: a name, a hue, a lane, and a delete.
 *
 * Split from `rail-form.tsx` because that file passed ADR 0027's eighty-line cap for a `.tsx`, and split
 * **here** for the reason `bind-fields.tsx` was: this is the part with no behaviour. It holds no state,
 * makes no request and knows nothing about refusals — the form above owns all three, and every control
 * here reports through a callback rather than deciding anything.
 *
 * Every control is labelled with the rail's **stored** name rather than with the name as typed, so a
 * screen reader is not renaming the field under the person editing it, and two rails mid-rename cannot
 * both be announced as the same thing.
 */
export function RailFields(props: RailFieldsProps) {
  const { name, typed, colour, railOrder, features, mayReorder, mayRemove } = props
  const { mayRename, mayRecolour } = props
  const { onName, onCommit, onColour, onOrder, onRemove } = props
  return (
    <div className={ROW}>
      {mayRename ? (
        <input
          aria-label={`Name of ${name}`}
          className={INPUT}
          maxLength={LIMITS.nameLength}
          onBlur={onCommit}
          onChange={(event) => onName(event.target.value)}
          type="text"
          value={typed}
        />
      ) : (
        <span className="text-[13px] font-medium">{name}</span>
      )}
      {mayRecolour ? (
        <input
          aria-label={`Colour of ${name}`}
          className={SWATCH}
          onChange={(event) => onColour(event.target.value)}
          type="color"
          value={colour}
        />
      ) : (
        <span className={DOT} style={{ backgroundColor: colour }} />
      )}
      {mayReorder ? (
        <input
          aria-label={`${RAIL_FIELD_WORDS.order} of ${name}`}
          className={ORDER}
          min={0}
          onChange={(event) => onOrder(event.target.value)}
          type="number"
          value={railOrder}
        />
      ) : null}
      {mayRemove ? (
        <Button onClick={onRemove} size="sm" type="button" variant="outline">
          {deleteWords(features)}
        </Button>
      ) : null}
    </div>
  )
}
