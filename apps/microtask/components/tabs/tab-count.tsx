import type { ProgressValue } from '@repo/contracts'

const COUNT = 'rounded-full bg-brand-soft px-1.5 text-[11px] text-brand transition-none'

const COUNT_ACTIVE = 'rounded-full bg-gold/30 px-1.5 text-[11px] text-foreground transition-none'

/** Props for {@link TabCount}. */
export interface TabCountProps {
  /** The tab's checklist count. */
  progress: ProgressValue
  /** Whether the tab is the open one, which tints the pill gold rather than indigo. */
  active: boolean
}

/**
 * A tab's `done/total` pill, or nothing for a tab with no checklist items.
 *
 * It never animates (`transition-none`): the open tab's pill changes on every keystroke, and
 * legacy turned the transition off for exactly that reason.
 */
export function TabCount({ progress, active }: TabCountProps) {
  if (progress.total === 0) return null
  return (
    <span className={active ? COUNT_ACTIVE : COUNT} data-slot="tab-count">
      {`${String(progress.done)}/${String(progress.total)}`}
    </span>
  )
}
