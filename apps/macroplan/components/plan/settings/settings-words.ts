/**
 * What the plan's own settings are called, and what each section of them is.
 *
 * `danger` is the whole sentence and not the word `Delete`, because the button inside that section is
 * labelled `Delete` — a heading and a control reading the same word are two elements a query cannot tell
 * apart, and neither can somebody listening to the page. The same pairing runs one level down, where the
 * trigger says `Delete` and the confirm says `Delete plan`.
 *
 * `open` names the seat surface's disclosure **and** the admin drawer's heading, which is why these are a
 * module of their own rather than a const in either: two frames render these three sections
 * (`settings-sections.tsx` says why), and a heading that differed between them would be one fact written
 * twice. It is also what keeps this importable from both without either importing the other.
 */
export const SETTINGS_WORDS = {
  open: 'Plan settings',
  name: 'Name',
  timing: 'Calendar',
  danger: 'Delete this plan',
} as const
