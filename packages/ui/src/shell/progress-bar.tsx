const TRACK = 'h-[7px] w-[92px] overflow-hidden rounded-[4px] bg-border'

const OUTSTANDING_FILL =
  'block h-full rounded-[4px] bg-linear-to-r from-gold to-gold-deep animate-progress-fill'

const COMPLETE_FILL =
  'block h-full rounded-[4px] bg-linear-to-r from-ok-light to-ok animate-progress-fill'

/** Props for {@link ProgressBar}. */
export interface ProgressBarProps {
  /** Checklist items ticked. */
  done: number
  /** Checklist items in total. Zero means "no tasks". */
  total: number
  /** Whether to render the text label beside the bar. Defaults to true. */
  label?: boolean
}

/**
 * The signature 92x7 progress bar: a gold gradient that flips to green at 100%,
 * animating from zero width on first paint through the `progress-fill` keyframe.
 *
 * The two gradients are whole class strings held in constants rather than one
 * string with the colour interpolated in, because Tailwind's scanner reads
 * source as plain text and emits nothing for a name it cannot see literally.
 * The width is an inline style for the same reason — it is a runtime number, so
 * no class could ever carry it.
 *
 * At `total === 0` the label reads `No tasks yet` and the bar still renders at
 * zero width, which is what the admin surfaces did.
 */
export function ProgressBar({ done, total, label = true }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = total > 0 && done === total
  return (
    <div className="flex items-center gap-2.5 text-[12.5px] whitespace-nowrap text-muted-foreground">
      <div className={TRACK}>
        <div
          className={complete ? COMPLETE_FILL : OUTSTANDING_FILL}
          data-slot="progress-bar-fill"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      {label ? (
        <span>
          {total > 0 ? `${String(done)} / ${String(total)} · ${String(percent)}%` : 'No tasks yet'}
        </span>
      ) : null}
    </div>
  )
}
