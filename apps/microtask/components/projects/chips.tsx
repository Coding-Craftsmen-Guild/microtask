import { MAX_LISTED_TAB_NAMES } from '@repo/contracts'

/** Props for {@link Chips}. */
export interface ChipsProps {
  /** What the chips name, in the order to draw them. Only the first eight are drawn. */
  names: readonly string[]
  /** How many there are in all, which may be more than `names` carries. */
  total: number
  /** The list's accessible name, such as `Tabs`. */
  label: string
}

const CHIP = 'rounded-full bg-brand-soft px-2 py-0.5 text-[12px] text-brand'

const MORE = 'rounded-full px-1 py-0.5 text-[12px] text-muted-foreground'

/**
 * The pill chips under a row's metadata line: the first eight names, and how many more.
 *
 * Eight because that is where the app being replaced cut off, and the manifest caches exactly
 * that many (ADR 0034). It dropped the rest with no indicator; `total` is what lets this one say
 * `+4 more` instead of pretending a twelve-tab task has eight.
 */
export function Chips({ names, total, label }: ChipsProps) {
  const shown = names.slice(0, MAX_LISTED_TAB_NAMES)
  const more = total - shown.length
  if (shown.length === 0) return null
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {shown.map((name, index) => (
        <li className={CHIP} key={index}>
          {name}
        </li>
      ))}
      {more > 0 ? <li className={MORE}>{`+${String(more)} more`}</li> : null}
    </ul>
  )
}
