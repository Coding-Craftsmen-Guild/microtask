import type { Treatment } from '@repo/canvas'
import type { CSSProperties } from 'react'

const CONTRADICTED_FILL_OPACITY = 0.15

/**
 * How much of the hue a mark whose work has begun is filled with.
 *
 * Between the faint wash a contradicted mark gets and the full fill of an untouched one, which is the
 * ordering that makes the three progress levels readable at a glance: lighter means less of the hue, and
 * `'started'` is the only one of the three that is partly filled. It is a **fixed** fraction and not the
 * task's own percentage — the note on {@link TREATMENT_CLASS} records why a continuous fill is unavailable
 * at one element per item.
 *
 * Exported because it is documented: `local/tsdoc-comments-only` admits TSDoc on an exported declaration
 * only, and `treatments.test.ts` reads it rather than repeating the number.
 */
export const STARTED_FILL_OPACITY = 0.45

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
 * ### The three progress levels, and what tells them apart
 *
 * `solid`, `started` and `done` are what the canvas says about work: untouched, begun, finished. All three
 * keep the epic's hue in the fill, so §5's "an item is always its epic's colour" holds throughout, and they
 * are told apart by **how much** of that hue is filled and by what the outline is drawn in — which survives
 * greyscale, the three differing in lightness as well as in outline.
 *
 * `started` is a partial fill at {@link STARTED_FILL_OPACITY} outlined in the hue itself; `done` is a full
 * fill outlined in the **foreground** colour. That is what keeps the two distinct at a glance rather than
 * only on inspection: a begun mark is quieter than its neighbours, and a finished one is the only mark on
 * the canvas outlined in something that is not its own colour.
 *
 * `done` is a solid bar with an outline in the foreground colour, which is the one drawing available
 * here that survives greyscale without taking a channel the split has already spent: the fill stays the
 * epic's hue, so §5's "an item is always its epic's colour" holds, and the outline is what says finished.
 * It is deliberately **not** a second element — no nested fill, no tick — because `item-mark.tsx` holds
 * the canvas to exactly one element per item so a plan at the 2,000-item cap stays 2,000 nodes, and a
 * partial fill tracking a task's own count wants either a second element per item or a gradient definition
 * per hue-and-fraction pair — forty rails by ten buckets is four hundred definitions, worse than the thing
 * it replaces. What that rules out is a **continuous** fill, and `started` is what it does not rule out: a
 * third discrete level costs one more key in each of the two records here and no element at all. So the
 * canvas answers untouched, begun, finished, and the **number** stays in the table, which is the rendering
 * a reader can actually read.
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
  done: 'fill-muted-foreground stroke-foreground stroke-[1.5]',
  started: 'fill-muted-foreground stroke-muted-foreground stroke-1',
}

const HUE_CHANNEL: Readonly<Record<Treatment, (colour: string) => CSSProperties>> = {
  solid: (colour) => ({ fill: colour }),
  hollow: (colour) => ({ stroke: colour }),
  contradicted: (colour) => ({ fill: colour, fillOpacity: CONTRADICTED_FILL_OPACITY }),
  done: (colour) => ({ fill: colour }),
  started: (colour) => ({ fill: colour, fillOpacity: STARTED_FILL_OPACITY, stroke: colour }),
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
