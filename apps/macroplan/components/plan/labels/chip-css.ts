/**
 * The group chips, as whole class strings.
 *
 * ### One height, and a full radius
 *
 * 24px and `rounded-full`, which is what a chip is and what the segmented switches beside them are
 * not. The first revision drew them as outlined pills at the same radius as the buttons at the end
 * of the row, so a row of six read as six buttons that happened to be about groups.
 *
 * ### One custom property, and three classes that spend it
 *
 * A group's hue comes from the plan, and Tailwind's scanner reads class names as plain text — so no
 * class can carry it, and `canvas/treatments.ts` already records what follows: the class fixes the
 * *treatment* and the hue arrives separately. Here the treatment is three statements — a tint behind,
 * a dark ink on top, a ring when the radio beside me is checked — and the hue arrives once, as
 * `--chip-hue` on the chip's own `style`. The classes below are literals the scanner can see; what is
 * inside their brackets is not a colour but a reference and a mix.
 *
 * Mixing in the class rather than in the `style` is deliberate and was a defect first. With
 * `backgroundColor: 'color-mix(…)'` in the style object the tint is correct in a browser and
 * **absent in a test**: `happy-dom` parses inline declarations and drops a value it does not
 * understand, so the one thing a test could read was already gone by the time it looked. A custom
 * property survives that, because a custom property is not parsed as a colour.
 *
 * `All work` needs none of it. It has no hue, so its chosen state is the brand and three static
 * `peer-checked:` utilities say the whole thing.
 */
export const CHIP = {
  row: 'flex flex-wrap items-center gap-1.5',
  all: 'inline-flex h-6 cursor-pointer items-center rounded-full border border-line-strong bg-background px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand',
  group:
    'inline-flex h-6 max-w-[14rem] cursor-pointer items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--chip-hue)_10%,white)] px-2.5 text-[12px] font-medium text-[color-mix(in_oklch,var(--chip-hue)_60%,black)] peer-checked:shadow-[0_0_0_1.5px_var(--chip-hue)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand',
  dot: 'size-2 shrink-0 rounded-full',
  name: 'min-w-0 truncate',
  count: 'shrink-0 tabular-nums opacity-60',
  add: 'inline-flex h-6 items-center rounded-full border border-dashed border-[#d4d4d4] px-2.5 text-[12px] font-medium text-muted-foreground hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
} as const
