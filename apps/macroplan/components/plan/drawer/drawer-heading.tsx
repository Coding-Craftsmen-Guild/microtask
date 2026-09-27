import type { TableRow } from '../table/rows'

/**
 * What a drawer calls the kind of thing it has open.
 *
 * The schema's words are `feature` and `item`; these are their interface spellings, capitalised and
 * used as the eyebrow over the subject's name.
 */
export const KINDS: Readonly<Record<TableRow['kind'], string>> = {
  feature: 'Feature',
  item: 'Item',
}

/**
 * The name a row goes by in a drawer's title.
 *
 * An item row carries both its own name and the name of the feature it is under, because the table
 * shows an item on a line beneath its feature and needs both. A drawer is open on one subject, so it
 * takes the item's own name where there is one and the feature's where there is not.
 */
export const nameOf = (row: TableRow): string =>
  row.kind === 'item' && row.item !== null ? row.item : row.feature
