import type { CreateKind } from './create-kinds'

const EPIC = 'inline-block h-2.5 w-3.5 shrink-0 rounded-[2px] border-[1.5px] border-brand border-l-4'

const FEATURE = 'inline-block h-1.5 w-4 shrink-0 rounded-[2px] border border-brand bg-brand/20'

const ITEM = 'inline-flex shrink-0 items-center gap-0.5'

const ITEM_FULL = 'inline-block size-1.5 rounded-[1px] bg-brand'

const ITEM_HALF = 'inline-block size-1.5 rounded-[1px] bg-brand/50'

/** Props for {@link CreateGlyph}. */
export interface CreateGlyphProps {
  readonly kind: CreateKind
}

/**
 * The little shape on each pill, which says what the thing it makes looks like on the board.
 *
 * ### Why shapes and not icons
 *
 * Each one is the mark the board actually draws, shrunk: an epic is an outlined lane with a thick
 * left edge, a feature is a washed bar with a stroke, an item is two small squares of which the
 * second is half as strong. A reader who has looked at the board for ten seconds can match all three
 * without being told, which no generic plus-in-a-circle can do.
 *
 * ### Why they are boxes and not SVG
 *
 * Three shapes, each of which is a rectangle with a border and a fill. A `<span>` with Tailwind says
 * exactly that in one class string the scanner can see; an inline `<svg>` would be three elements
 * apiece for the same rectangle, and every colour in it would have to be written as an attribute
 * rather than taken from the token the rest of the pill is painted with.
 *
 * `aria-hidden`, because the pill beside it says the word. A glyph that announced itself would make
 * each control read its own name twice.
 */
export function CreateGlyph({ kind }: CreateGlyphProps) {
  if (kind === 'epic') return <span aria-hidden="true" className={EPIC} />
  if (kind === 'feature') return <span aria-hidden="true" className={FEATURE} />
  return (
    <span aria-hidden="true" className={ITEM}>
      <span className={ITEM_FULL} />
      <span className={ITEM_HALF} />
    </span>
  )
}
