import type { Treatment } from '@repo/canvas'
import type { CSSProperties } from 'react'

const CONTRADICTED_FILL_OPACITY = 0.15

/**
 * How each of the three schedule states is drawn, as whole literal class strings.
 *
 * Spec §5: "**Epic owns hue. Status owns treatment.** Both point 6 (per-epic colours) and point 10
 * (red/green status) wanted hue, and hue cannot carry two meanings." This record is the treatment
 * half, and {@link hueStyle} is the hue half. **The split is not a style preference; it is what each
 * mechanism can express.** A treatment is a closed three-case union, so every class it can ever need
 * is written out here where Tailwind's scanner reads it as text. A colour is a `#rrggbb` the API
 * validated, one of an unbounded set chosen at runtime, so no class name can exist for it and it has
 * to be an inline `style` — the same reason `ProgressBar` holds two gradients as constants and its
 * width as a style.
 *
 * Each string also carries a **class-level fallback for the channel the hue would paint**:
 * `fill-muted-foreground` on a solid bar, `stroke-muted-foreground` on a hollow one. An inline style
 * beats a class, so a rail that has a colour paints over the fallback and the rail whose `epicId`
 * names no epic — `RailBox.colour` is `null` there, and there is no hue to carry — draws grey rather
 * than invisible.
 *
 * `contradicted` is §5's "dashed red outline", and its outline is **red rather than the epic's hue**
 * because that is the one case where the treatment owns the stroke: the plan contradicts itself, and
 * a dependency cycle is not a fact about an epic. The hue survives in the fill, at
 * {@link CONTRADICTED_FILL_OPACITY}, so §5's "an item is always its epic's colour" still holds.
 */
export const TREATMENT_CLASS: Readonly<Record<Treatment, string>> = {
  solid: 'fill-muted-foreground stroke-none',
  hollow: 'fill-none stroke-muted-foreground stroke-2',
  contradicted: 'fill-destructive/15 stroke-destructive stroke-2 [stroke-dasharray:5_3]',
}

const HUE_CHANNEL: Readonly<Record<Treatment, (colour: string) => CSSProperties>> = {
  solid: (colour) => ({ fill: colour }),
  hollow: (colour) => ({ stroke: colour }),
  contradicted: (colour) => ({ fill: colour, fillOpacity: CONTRADICTED_FILL_OPACITY }),
}

/**
 * The inline paint one mark's epic hue becomes, on the channel its treatment leaves free.
 *
 * A solid mark is filled with the hue; a hollow one is outlined in it, because there is nothing to
 * fill — the forward pass placed no span, so `'hollow'` says "nothing was sized" rather than "sized
 * at zero", and an outline is the only way to draw a thing with no duration that is not a line of
 * zero width. A contradicted one keeps the hue as a faint fill and leaves the stroke to
 * {@link TREATMENT_CLASS}, for the reason argued there.
 *
 * `null` — the rail whose `epicId` names no epic in the plan — yields **no style at all**, so the
 * class fallback shows through. An invented default hue here would make an unclaimed rail look like
 * a claimed one.
 *
 * The channel comes from a `Readonly<Record<Treatment, …>>` and **not** from a chain of `if`s ending
 * in an unconditional return, which is what this was. Both halves of the split must fail the same
 * way: a fourth treatment is already a compile error in {@link TREATMENT_CLASS}, and under a chain it
 * would have compiled here and been painted like `'solid'` — a filled bar for a state that may well
 * mean the opposite, arriving silently. Phase 4 widens this union, so that is a real edit and not a
 * hypothetical one.
 */
export const hueStyle = (treatment: Treatment, colour: string | null): CSSProperties =>
  colour === null ? {} : HUE_CHANNEL[treatment](colour)
