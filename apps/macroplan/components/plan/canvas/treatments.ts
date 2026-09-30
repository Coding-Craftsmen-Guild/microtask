import type { Treatment } from '@repo/canvas'
import type { CSSProperties } from 'react'

const CONTRADICTED_FILL_OPACITY = 0.12

/** How solid a planned bar's fill is: a wash, with the outline carrying the colour. */
export const PLANNED_FILL_OPACITY = 0.18

/** How solid a started bar's fill is — filled in as far as the work has got. */
export const STARTED_FILL_OPACITY = 0.5

/** How solid a finished bar's fill is: as near solid as the label on top of it allows. */
export const DONE_FILL_OPACITY = 0.8

/**
 * What each state looks like as a **bar**, as whole class strings.
 *
 * ### A wash and an outline, not a slab
 *
 * Every bar is a translucent fill inside a solid stroke of the same hue. Three things follow. The
 * grid and the today line stay visible *through* the bars rather than being covered by them, so the
 * chart keeps the structure that makes a date readable. A row of bars in one rail's colour reads as
 * a row of distinct pieces of work, because each carries its own edge. And the fill is then free to
 * carry a second meaning — how far along the work is — because it is no longer doing the job of
 * saying "here is a bar at all".
 *
 * | state | fill | reads as |
 * | --- | --- | --- |
 * | `solid` | a wash | planned, not started |
 * | `started` | half | under way |
 * | `done` | nearly full | finished |
 * | `hollow` | none | known, but not sized by its children |
 * | `contradicted` | dashed, destructive | the plan disagrees with itself here |
 *
 * Four of the five are one hue at four weights, which is what lets progress along a rail be read
 * without a legend. The fifth is the only colour change on the canvas, and it is kept for the one
 * state that is a problem rather than a stage.
 *
 * ### Why a rail's colour arrives as an inline style
 *
 * A rail's colour comes from the plan and cannot be a class: Tailwind's scanner reads source as
 * plain text and emits nothing for a class name assembled at runtime. The class fixes the
 * *treatment* — which channel the colour lands in, what the stroke does — and {@link hueStyle} fixes
 * the hue. The classes below are the fallback for a rail with no colour of its own.
 */
export const TREATMENT_CLASS: Readonly<Record<Treatment, string>> = {
  solid: 'fill-chart-3/20 stroke-chart-3 stroke-[1.25]',
  hollow: 'fill-none stroke-chart-3 stroke-[1.25] [stroke-dasharray:3_2]',
  contradicted: 'fill-destructive/10 stroke-destructive stroke-[1.25] [stroke-dasharray:4_3]',
  done: 'fill-chart-4/80 stroke-chart-4 stroke-[1.25]',
  started: 'fill-chart-3/50 stroke-chart-3 stroke-[1.25]',
}

const HUE_CHANNEL: Readonly<Record<Treatment, (colour: string) => CSSProperties>> = {
  solid: (colour) => ({ fill: colour, fillOpacity: PLANNED_FILL_OPACITY, stroke: colour }),
  hollow: (colour) => ({ stroke: colour }),
  contradicted: (colour) => ({ fill: colour, fillOpacity: CONTRADICTED_FILL_OPACITY }),
  done: (colour) => ({ fill: colour, fillOpacity: DONE_FILL_OPACITY, stroke: colour }),
  started: (colour) => ({ fill: colour, fillOpacity: STARTED_FILL_OPACITY, stroke: colour }),
}

/**
 * The rail's colour in whichever channels a **bar** of this treatment paints with.
 *
 * Both the fill and the stroke, for every treatment that has both: a bar is one hue at two strengths
 * — a wash inside a solid edge — so splitting the colour across two sources would let the edge and
 * the fill of one bar disagree about which rail it is on.
 */
export const hueStyle = (treatment: Treatment, colour: string | null): CSSProperties =>
  colour === null ? {} : HUE_CHANNEL[treatment](colour)

/**
 * What each state looks like as a **point**, which is not what it looks like as a bar.
 *
 * A point is eight pixels across. A wash inside an outline is legible at a hundred pixels wide and
 * is mud at eight, so a node fills solid and spends its stroke on the halo instead — the ring in the
 * page's own colour that keeps two near neighbours from merging. The states are then told apart by
 * fill strength alone, which is all the room a point has.
 *
 * `hollow` and `contradicted` keep a visible outline because at this size an unfilled circle and a
 * missing one look the same, and both of those states are the plan saying something is wrong.
 */
export const NODE_CLASS: Readonly<Record<Treatment, string>> = {
  solid: 'fill-chart-3 stroke-background stroke-[1.5]',
  hollow: 'fill-background stroke-chart-3 stroke-[1.5]',
  contradicted: 'fill-background stroke-destructive stroke-2',
  done: 'fill-chart-4 stroke-background stroke-[1.5]',
  started: 'fill-chart-3 stroke-background stroke-[1.5]',
}

const NODE_HUE: Readonly<Record<Treatment, (colour: string) => CSSProperties>> = {
  solid: (colour) => ({ fill: colour }),
  hollow: (colour) => ({ stroke: colour }),
  contradicted: () => ({}),
  done: (colour) => ({ fill: colour }),
  started: (colour) => ({ fill: colour, fillOpacity: STARTED_FILL_OPACITY }),
}

/**
 * The rail's colour in whichever channel a **node** of this treatment paints with.
 *
 * The halo is never given the hue: it is the page's colour on purpose, and letting a rail's own
 * colour into it would put a second ring of the same hue around a dot of that hue, which is a
 * slightly larger dot.
 */
export const nodeStyle = (treatment: Treatment, colour: string | null): CSSProperties =>
  colour === null ? {} : NODE_HUE[treatment](colour)
