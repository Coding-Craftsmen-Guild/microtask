/**
 * Every sentence the sidebar says, in one record.
 *
 * One record rather than strings scattered across four files, for the reason `VIEW_SWITCH` is one: these are
 * a single voice and they are read together. `search` is an `aria-label` and `hint` a placeholder, which are
 * two different jobs — a placeholder disappears the moment somebody types, so it cannot be the field's name.
 *
 * `noFeatures` is the sentence a **new** rail says, which is the one a reader of an empty plan sees first;
 * it names the control that fixes it rather than describing the absence.
 *
 * `collapse` is the whole label of a rail's disclosure, with that rail's own name appended where it is
 * used — one word for both states rather than a pair swapped on `:checked`. A checkbox announces its own
 * state, so a reader hears "collapse Platform, checkbox, checked"; a label that changed with it would say
 * the state twice, and would contradict it on every render where the two had drifted.
 */
export const SIDEBAR_WORDS = {
  rails: 'Rails',
  search: 'Filter rails and features by name',
  hint: 'Filter…',
  noRails: 'This plan has no rails yet. A feature sits on a rail, so a rail is the first thing to add.',
  noFeatures: 'No features on this rail yet — Open it to add one.',
  collapse: 'Collapse',
  newRail: 'Add rail',
  newGroup: 'Add group',
  settings: 'Settings',
  share: 'Share',
} as const
