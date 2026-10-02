/**
 * A feature drawn as a line, and an item drawn as a bar, as whole class strings.
 *
 * ### Why the hue is an attribute and the treatment is a class
 *
 * The split `treatments.ts` records, applied to two new shapes: a group's colour comes from the plan
 * and Tailwind's scanner reads class names as plain text, so no class can carry it. The classes below
 * fix widths, radii and what goes faint; `stroke` and `fill` arrive as SVG presentation attributes,
 * which is the SVG spelling of what `hueStyle` does with an inline style for a bar.
 *
 * A **custom property** rather than one inline value per element, because a line is four shapes each
 * wanting the hue in a different channel: an inline style would have to be written onto each of them
 * while the class beside it set the same property and won. The hue lands once on the group as
 * `--mark-hue`, and the classes below spend it. A bar is one element and takes `hueStyle` directly.
 *
 * ### Why every label lets the pointer through
 *
 * A label covers most of the mark it names, and a pointer over it has to reach that mark. The hover
 * root finds what is under the pointer by walking up from the event's target to the nearest element
 * carrying a detail — and an item's detail is on the **rect**, not on a wrapper, so a `<text>` drawn
 * over it is a sibling rather than a descendant. A hover that landed on the words therefore found
 * nothing, and the card went missing over exactly the part of a bar a reader aims at.
 *
 * `pointer-events-none` is the whole fix and costs nothing, because no label is a target for
 * anything: the mark under it is the link and the drag handle both. It is the same declaration the
 * hover card and the drag ghost already carry, for the same reason — a thing drawn over the board
 * must not stand between the pointer and the board.
 *
 * ### What `[data-lit]` does
 *
 * Nothing here but on the line's rule, where the lit width is a different number. The hover sheet
 * (`./pointer-css.ts`) widens a lit mark's stroke and brings it back to full opacity, and it reaches
 * `feature-bar` and `item-mark` by slot — which is why a feature line's `<g>` carries
 * `data-slot="feature-bar"` though it is not a bar. The slot names *what the mark is of*, and three
 * sheets, the drag and the group dimming all key on it; renaming it to match the shape would have
 * been a rename in five places to describe a rectangle.
 *
 * The two **bars** keep their slot on the shape itself rather than on a wrapper, so every one of
 * those readers goes on finding a `<rect>` with the geometry on it. A line cannot: it is four
 * elements and none of them is the mark.
 */
export const LINE = {
  rule: 'stroke-[var(--mark-hue)] stroke-2 [[data-lit]>&]:stroke-[3]',
  diamond: 'fill-[var(--mark-hue)] [stroke:#fff] stroke-[1.5]',
  plate: 'pointer-events-none fill-background',
  label: 'pointer-events-none fill-[var(--mark-ink)] text-[10.5px] font-semibold [dominant-baseline:auto]',
} as const

/**
 * One item as a bar under its feature's line.
 *
 * The bar itself needs nothing of its own: `treatments.ts`'s `TREATMENT_CLASS` already fixes the
 * wash, the stroke and its width, and widening a lit one is `pointer-css.ts`'s. What is left is the
 * **label**, whose ink is mixed from the group's hue — so an item reads as belonging to its feature
 * without a second colour being stored anywhere.
 *
 * One key and not two, because a second would have had to be composed onto the treatment's class
 * string, and `../module-boundaries.test.tsx` refuses a composed class name outright: Tailwind's
 * scanner reads class names as text, and the one it cannot see is the one it emits no CSS for.
 */
export const ITEM = {
  label: 'pointer-events-none text-[12px] font-medium [dominant-baseline:auto]',
} as const
