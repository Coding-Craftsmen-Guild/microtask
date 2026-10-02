/**
 * How wide one character is, in px, at each of the two sizes the canvas writes at.
 *
 * Measured in a browser rather than derived, for `header-cells.ts`'s reason: `happy-dom` answers
 * every text measurement with zero, so nothing here can ask. They are **averages** over the system
 * stack at 12px and 10.5px — a `W` is wider and an `i` narrower — which is what makes the budget
 * below an estimate rather than a fit.
 *
 * Estimating is the right trade for this. The alternative is one `getComputedTextLength` per label on
 * a canvas that draws two thousand marks, each one a forced layout, to decide whether a name ends in
 * an ellipsis one character early. The cost of being wrong is a label a character short or a
 * character long inside a clip that catches it either way.
 */
export const CHAR_WIDTH = { bar: 6.2, line: 5.5 } as const

/**
 * The shortest label worth writing, in characters.
 *
 * Below this a name is a few letters and an ellipsis, which says less than nothing: a reader cannot
 * tell `Au…` from `Ac…`, and the glyphs make the bar look like it has a defect rather than a name.
 * The same rule `header-cells.ts` applies to a quarter too narrow for its own name — draw the mark,
 * draw no words — and for the same reason.
 *
 * ### Why six and not four
 *
 * Four is where a name stops being readable and six is where it stops being **worth the element**.
 * This product caps a plan at 2,000 items, and a label is a `<text>` and the `<g>` that has to wrap
 * it: labelling every mark on a plan at the cap more than doubles the canvas's element count, which
 * is the one number `plan-canvas.test.tsx` guards because it is the one that grows with the plan.
 *
 * Six characters is a one-day item at the Sprint stop — 42px, of which 14 is padding. So the marks
 * that lose their label are exactly the ones that could not have said much, and a two-day item, which
 * is what a plan broken down by hand actually holds, keeps eleven characters.
 */
export const LEGIBLE = 6

const ELLIPSIS = '…'

/**
 * A name cut to what a mark that wide can hold, or `''` where it can hold nothing legible.
 *
 * ### Why the canvas writes text again at all
 *
 * It stopped. Every bar carried a `<text>` cut to a budget worked out against the gap to the next
 * bar, and at four pixels a day that budget was routinely zero or wide enough to print over the
 * neighbour — so the labels went, and the hover card and the table became the only places a mark was
 * named. That was the right call for a canvas whose finest stop was 14px a day and whose features
 * were 22px bars.
 *
 * It is the wrong call now, and the numbers are why. The Sprint stop draws **item** bars at 40px a
 * day: a two-day item is 80px wide, which is a dozen characters. A board where every piece of work
 * says what it is, is a board a reader can use without a pointer — and the budget is what keeps that
 * from degrading into the mess it was, because a mark too narrow is given no label rather than a
 * clipped one.
 *
 * @param text - The name as the plan stores it.
 * @param width - How wide the mark is, in px.
 * @param padding - The ink-free space inside it, both ends together.
 * @param size - Which of the two sizes the label is written at.
 * @returns The name, the name cut and ellipsised, or `''`.
 */
export function fitLabel(
  text: string,
  width: number,
  padding: number,
  size: keyof typeof CHAR_WIDTH = 'bar',
): string {
  const room = Math.floor((width - padding) / CHAR_WIDTH[size])
  if (room < LEGIBLE) return ''
  if (text.length <= room) return text
  return `${text.slice(0, Math.max(room - 1, 1)).trimEnd()}${ELLIPSIS}`
}
