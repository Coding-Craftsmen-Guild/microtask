import type { Treatment } from '@repo/canvas'
import type { CSSProperties } from 'react'

const CONTRADICTED_FILL_OPACITY = 0.12

/**
 * How solid a started bar's fill is.
 *
 * Exported because the same number decides whether a treatment reads as under way, and a test pins it
 * against what the class does rather than trusting two copies of it.
 */
export const STARTED_FILL_OPACITY = 0.45

/**
 * What each state looks like, as whole class strings.
 *
 * ### The vocabulary
 *
 * | state | reads as |
 * | --- | --- |
 * | `solid` | planned, not started: a filled bar in the rail's colour |
 * | `started` | under way: the same bar at part opacity, outlined in its own colour |
 * | `done` | finished: filled, with a darker rule around it |
 * | `hollow` | known but not sized by its children: an outline only |
 * | `contradicted` | the plan disagrees with itself here: dashed, in the destructive colour |
 *
 * Four of the five are the same hue at different weights, which is what lets a reader see progress
 * along a rail without a legend. The fifth is the only colour change on the canvas, and it is
 * reserved for the one state that is a problem rather than a stage.
 *
 * ### Why a rail's colour arrives as an inline style
 *
 * A rail's colour comes from the plan and cannot be a class: Tailwind's scanner reads source as
 * plain text and emits nothing for a class name assembled at runtime. The class fixes the
 * *treatment* — which channel the colour lands in and what the stroke does — and {@link hueStyle}
 * fixes the hue.
 */
export const TREATMENT_CLASS: Readonly<Record<Treatment, string>> = {
  solid: 'fill-chart-3 stroke-none',
  hollow: 'fill-background stroke-chart-3 stroke-[1.5]',
  contradicted: 'fill-destructive/10 stroke-destructive stroke-[1.5] [stroke-dasharray:4_3]',
  done: 'fill-chart-4 stroke-foreground/30 stroke-1',
  started: 'fill-chart-3 stroke-chart-3 stroke-1',
}

const HUE_CHANNEL: Readonly<Record<Treatment, (colour: string) => CSSProperties>> = {
  solid: (colour) => ({ fill: colour }),
  hollow: (colour) => ({ stroke: colour }),
  contradicted: (colour) => ({ fill: colour, fillOpacity: CONTRADICTED_FILL_OPACITY }),
  done: (colour) => ({ fill: colour }),
  started: (colour) => ({ fill: colour, fillOpacity: STARTED_FILL_OPACITY, stroke: colour }),
}

/**
 * The rail's own colour, put into whichever channel this treatment paints with.
 *
 * An inline style and not a class, because the colour comes from the plan and Tailwind's scanner
 * reads source as plain text: a class name assembled at runtime is one it emits no CSS for.
 */
export const hueStyle = (treatment: Treatment, colour: string | null): CSSProperties =>
  colour === null ? {} : HUE_CHANNEL[treatment](colour)
