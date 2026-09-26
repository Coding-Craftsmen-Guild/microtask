'use client'

const INPUT = 'h-8 w-[18ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

const SWATCH = 'size-8 cursor-pointer rounded-md border border-input bg-transparent'

const DOT = 'inline-block size-3 rounded-full'

/** Props for {@link LabelFields}. */
export interface LabelFieldsProps {
  /** The group's stored name, which is what the two labels here name it by. */
  readonly stored: string

  /** The name as typed so far. Controlled, because the form puts the stored value back on a refusal. */
  readonly typed: string

  /** Its colour as stored, which a colour input has no half-typed state to hold. */
  readonly colour: string

  /** Called with each keystroke. */
  readonly onTyped: (value: string) => void

  /** Called when the name should be sent, which is on blur rather than per keystroke. */
  readonly onCommit: () => void

  /** Called with a colour the moment one is picked. */
  readonly onColour: (value: string) => void

  /**
   * Whether the name is editable — `renameLabel`. A reader without it is shown the name as **text**.
   *
   * The panel is opened on `label:create`, which is a **different** action from `label:rename`, so a
   * reader who may make a group and not rename one is a real principal. Until this answer existed the
   * field was live for anybody who could see the panel and the two controls were read by nothing — which
   * is the decoration `lib/plan-capabilities.ts` warns about, found by auditing the rails panel beside it.
   */
  readonly mayRename: boolean

  /** Whether the hue is editable — `recolourLabel`, the same authority drawn as its own control. */
  readonly mayRecolour: boolean
}

/**
 * A group's name and its colour, as two controls and no behaviour.
 *
 * Split from `label-form.tsx` when that file passed ADR 0027's fifty-line cap for a function, and split
 * **here** for the reason `bind-fields.tsx` was: these two hold no state of their own, make no request and
 * know nothing about a refusal — the form above owns all three.
 *
 * The name commits on **blur** and not per keystroke, so renaming a group is one request rather than one
 * per letter; the colour commits on change, a colour input having no half-typed state to wait for. Both are
 * labelled by the group's **stored** name rather than by what is being typed, so a screen reader announcing
 * the pair mid-edit names the group the reader opened rather than a half-typed one.
 */
export function LabelFields(props: LabelFieldsProps) {
  const { stored, typed, colour, onTyped, onCommit, onColour, mayRename, mayRecolour } = props
  return (
    <>
      {mayRename ? (
        <input
          aria-label={`Name of ${stored}`}
          className={INPUT}
          onBlur={onCommit}
          onChange={(event) => onTyped(event.target.value)}
          type="text"
          value={typed}
        />
      ) : (
        <span className="text-[13px] font-medium">{stored}</span>
      )}
      {mayRecolour ? (
        <input
          aria-label={`Colour of ${stored}`}
          className={SWATCH}
          onChange={(event) => onColour(event.target.value)}
          type="color"
          value={colour}
        />
      ) : (
        <span className={DOT} style={{ backgroundColor: colour }} />
      )}
    </>
  )
}
