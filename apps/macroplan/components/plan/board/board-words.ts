/**
 * Every sentence the board's own chrome says, in one record.
 *
 * `filter` is the field's accessible name and `hint` its placeholder, and the two differ on purpose:
 * a placeholder disappears the moment somebody types, so it may be the short form, while the name is
 * what a screen reader reads out every time the field is reached and has to say what is being
 * filtered rather than merely that something is.
 *
 * It says **rails and features** because that is what it narrows — a rail's row in the column, and a
 * feature's marks on the canvas. It used to say rails alone, from a tree whose features were rows in
 * the same list; the features are on the board now, and a control that named only half of what it
 * does is how somebody concludes it does not work.
 */
export const BOARD_WORDS = {
  filter: 'Filter rails and features by name',
  hint: 'Filter rails and features',
} as const
