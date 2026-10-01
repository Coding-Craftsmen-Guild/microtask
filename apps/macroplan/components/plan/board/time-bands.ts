import type { CalendarBand, SprintTick } from '@repo/canvas'
import type { Rung } from '@repo/canvas'

/** One year's span across the axis, as the top tier of the header draws it. */
export interface YearBand {
  readonly year: number

  readonly label: string

  readonly x: number

  readonly width: number
}

/**
 * The years the axis crosses, derived from the quarters under them.
 *
 * ### Why this is derived and not a fourth function in `@repo/canvas`
 *
 * A year is exactly four calendar quarters and `calendarBands` already answers those, each carrying
 * its own year and its own geometry. Asking the geometry package for years as well would be a second
 * walk over the same calendar, and the one thing that must hold here — that a year's band opens where
 * its first quarter opens and ends where its last one ends — is true by construction when it is a
 * fold over that answer and merely *checked* when it is a second derivation.
 *
 * The quarters arrive in axis order, so the fold is one pass and needs no sort: a year is extended
 * while its quarters keep arriving and closed when a different one does.
 *
 * @param bands - The quarters the header is drawing, in axis order.
 * @returns One band per year, each spanning its own quarters.
 */
export function yearBands(bands: readonly CalendarBand[]): readonly YearBand[] {
  const years: YearBand[] = []
  for (const band of bands) {
    const open = years.at(-1)
    if (open !== undefined && open.year === band.year) {
      years[years.length - 1] = { ...open, width: band.x + band.width - open.x }
      continue
    }
    years.push({ year: band.year, label: String(band.year), x: band.x, width: band.width })
  }
  return years
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const ISO_PARTS = 3

/**
 * An ISO date as the header says it: `2026-09-28` becomes `Sep 28`.
 *
 * ### Why the string is split and no `Date` is made
 *
 * `new Date('2026-09-28')` is parsed as UTC midnight and then read back in the **viewer's** zone, so
 * a reader west of Greenwich is shown `Sep 27` for a sprint that opens on the 28th — and shown it
 * only in a browser, never on the server that rendered the same header. The date arrived as a plain
 * calendar date in the plan's own zone (`rangeOfSprint`), and a calendar date has no instant in it to
 * convert; splitting the string keeps it that way.
 *
 * Anything that is not three parts comes back unchanged rather than as `NaN undefined`, which is the
 * honest rendering of a value this function was not given.
 *
 * @param iso - A `YYYY-MM-DD` date, as `@repo/canvas` answers one.
 * @returns `MMM D`, or the input where it is not a date.
 */
export function shortDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== ISO_PARTS) return iso
  const month = MONTHS[Number(parts[1]) - 1]
  const day = Number(parts[2])
  return month === undefined || !Number.isFinite(day) ? iso : `${month} ${String(day)}`
}

/** What one sprint cell says: its name, and when it runs, or `''` where the stop has no room. */
export interface SprintWords {
  readonly name: string

  readonly when: string
}

/**
 * What a sprint cell says at each stop.
 *
 * ### Why the name shortens and the dates drop out
 *
 * A sprint cell is `sprintLengthDays × pxPerDay` wide, which is 400px at the Sprint stop, 120 at
 * Quarter and 40 at Year. `Sprint 1 · W40–41 · Sep 28 – Oct 9` fits in the first and is a smear in
 * the last, so each stop is told what it has room for rather than every stop being handed the same
 * string and left to clip. That is the same decision `header-cells.tsx` makes about a quarter's name,
 * reached the other way round: a quarter drops its label below a width, and a sprint changes it.
 *
 * The sprint is **1-based** in every one of them, where `SprintTick.sprint` is 0-based. The plan's
 * own vocabulary is `S1` — the pin field says it, the table's column says it, and the hover card says
 * it — and a header that opened at `S0` would be the only thing on the page counting from zero.
 *
 * @param tick - The sprint, as `sprintTicks` answered it.
 * @param rung - Which stop is drawn.
 * @returns The two lines, the second empty where there is no room for it.
 */
export function sprintWords(tick: SprintTick, rung: Rung): SprintWords {
  const number = String(tick.sprint + 1)
  if (rung === 'item') {
    return {
      name: `Sprint ${number}`,
      when: `${tick.label} · ${shortDate(tick.from)} – ${shortDate(tick.to)}`,
    }
  }
  return { name: `S${number}`, when: rung === 'feature' ? shortDate(tick.from) : '' }
}
