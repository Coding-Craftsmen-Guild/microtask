import type { TableRow } from '../table/rows'
import { LABEL } from './field'

const TITLE = 'text-base font-semibold'

const KINDS: Readonly<Record<TableRow['kind'], string>> = { feature: 'Feature', item: 'Item' }

const nameOf = (row: TableRow): string =>
  row.kind === 'item' && row.item !== null ? row.item : row.feature

/**
 * The id the drawer's own `aria-labelledby` names, which is why it is exported rather than local.
 *
 * The landmark is `./drawer-panel.tsx`'s and the heading is this file's, so the two halves of one
 * accessible name live in two modules and the constant is what keeps them the same string. A second
 * spelling of it would name nothing and fail silently — an `<aside>` pointing at no element is an
 * unnamed landmark, which is the one thing that arrangement must not be able to become.
 */
export const TITLE_ID = 'plan-drawer-title'

/** Props for {@link DrawerHeading}. */
export interface DrawerHeadingProps {
  /** The one subject the drawer is open on, as `tableRows` already worded it (`../table/rows.ts`). */
  readonly row: TableRow
}

/**
 * What the drawer is open on, said in words: the kind eyebrow, and the subject's name as a heading.
 *
 * ### Why it is its own file
 *
 * `./drawer-panel.tsx` named this move itself — the eyebrow and the heading, "`nameOf` and `KINDS`
 * going with them, being the only wording and the only reading of the row this file still owns". The
 * trigger it guessed at was a subtitle or a badge joining them; what actually arrived was the create
 * group, which is the same pressure from the other side. The frame is not shaved by this: the landmark,
 * the close link and every mount stay where they were, and what leaves is the one part of that file that
 * was reading the row and choosing words rather than arranging children.
 *
 * ### An `<h2>`, and the name is not a field's value
 *
 * The `<h1>` one level up is the plan's name and the layout renders both, so the two cannot be out of
 * order. The heading keeps naming the subject even where the name **field** is drawn under it: the
 * heading is what the landmark *is*, and a field's value is not an accessible name — a reader jumping to
 * the landmark hears what is open rather than what is being typed.
 *
 * Both strings are read straight off the row and neither is worded here. An item's own name is its
 * `item` column and a feature's is its `feature` column, which is the one reading of a `TableRow` this
 * drawer does at all; `rows.ts` decided every other string on the panel (§3.2).
 */
export function DrawerHeading({ row }: DrawerHeadingProps) {
  return (
    <>
      <p className={LABEL}>{KINDS[row.kind]}</p>
      <h2 className={TITLE} id={TITLE_ID}>
        {nameOf(row)}
      </h2>
    </>
  )
}
