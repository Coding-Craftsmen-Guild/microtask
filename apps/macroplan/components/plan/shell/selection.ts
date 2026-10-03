import { createContext, useContext } from 'react'
import { SELECT_RADIO_NAME } from '../board/rail-select-css'
import { GROUP_RADIO_NAME } from '../labels/group-css'

/** Which group and which rail the reader has chosen to bring forward, each `null` for none. */
export interface Chosen {
  readonly group: string | null
  readonly rail: string | null
}

/** Nothing chosen, which is how the page opens. */
export const NOTHING_CHOSEN: Chosen = { group: null, rail: null }

/**
 * The choice one changed control makes: a group's radio or a rail's, read by the radio's own value, and an
 * empty value — the All work chip, the rail group's nothing — clearing it. Any other control leaves the
 * choice exactly as it was, the same object, so a keystroke in a field re-renders nothing.
 *
 * The radios are still the controls, and still all a reader touches; this is how the shell learns which
 * one is checked, so that the two sheets can ask the shell rather than the radio (ADR 0069).
 *
 * @param was - The choice before the change.
 * @param target - The control the change came from.
 * @returns The choice after it.
 */
export function chosenBy(was: Chosen, target: EventTarget | null): Chosen {
  if (!(target instanceof HTMLInputElement) || target.type !== 'radio' || !target.checked) return was
  const value = target.value === '' ? null : target.value
  if (target.name === GROUP_RADIO_NAME) return value === was.group ? was : { ...was, group: value }
  if (target.name === SELECT_RADIO_NAME) return value === was.rail ? was : { ...was, rail: value }
  return was
}

const ChosenContext = createContext<Chosen>(NOTHING_CHOSEN)

/** Hands what the shell says is chosen to the radios that choose it (`./plan-shell.tsx`). */
export const ChosenProvider = ChosenContext.Provider

/**
 * What the shell says is chosen, which a radio checks itself by when it is drawn.
 *
 * The radios are uncontrolled — a click checks one with no render — but the board is not drawn while the
 * table is, so its radios come back new from a trip to the table, and a chip comes back new under its real
 * id once its group's create has been answered. A radio drawn anew is checked when it names what the shell
 * says is chosen, so the dimming on screen and the radio a screen reader announces never disagree.
 *
 * @returns The chosen group and rail, each `null` for none.
 */
export const useChosen = (): Chosen => useContext(ChosenContext)
