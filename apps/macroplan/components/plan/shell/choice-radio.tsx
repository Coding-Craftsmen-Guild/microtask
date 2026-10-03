import { useChosen, type Chosen } from './selection'

/** Props for {@link ChoiceRadio}. */
export interface ChoiceRadioProps {
  /** Which choice the radio makes: the group's or the rail's. */
  readonly of: keyof Chosen

  /** The id it chooses, or `null` for the one that chooses nothing (All work, no rail). */
  readonly value: string | null

  /** Its own id, which its label points at. */
  readonly id: string

  /** The radio group it is one of. */
  readonly name: string

  /** Its classes: visually hidden, and a Tailwind `peer` where its label is styled off it. */
  readonly className: string
}

/**
 * One of the radios a group or a rail is chosen by.
 *
 * Uncontrolled, as every one of them was: a click checks it with no render, and the shell hears the change
 * (`./plan-shell.tsx`). What it adds is the check it is **drawn** with, which is whether it names what the
 * shell says is chosen (`./selection.ts`) — so a radio drawn anew, the board's back from the table or a chip
 * back under its group's real id, says what the dimming on screen says. An empty value is the radio that
 * chooses nothing, which is what an empty value has always meant to the shell.
 */
export function ChoiceRadio({ of, value, id, name, className }: ChoiceRadioProps) {
  const chosen = useChosen()
  return (
    <input className={className} defaultChecked={chosen[of] === value} id={id} name={name} type="radio" value={value ?? ''} />
  )
}
