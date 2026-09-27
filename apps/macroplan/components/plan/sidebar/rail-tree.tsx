import Link from 'next/link'
import { featurePath, railPath } from '../../../lib/drawer-routes'
import { featureRadioId, railRadioId, SELECT_RADIO_NAME } from './select-css'
import type { SidebarRail } from './sidebar-rows'

const RAIL = 'grid gap-0.5'

const RAIL_ROW = 'flex items-center gap-2 rounded-md px-2 py-1 peer-checked:bg-muted'

const FEATURE_ROW =
  'flex items-center gap-2 rounded-md py-1 pr-2 pl-7 text-[13px] text-muted-foreground peer-checked:bg-muted peer-checked:text-foreground'

const SWATCH = 'size-2.5 shrink-0 rounded-full bg-muted-foreground'

const NAME = 'flex-1 cursor-pointer truncate text-[13px] font-medium'

const FEATURE_NAME = 'flex-1 cursor-pointer truncate'

const OPEN = 'shrink-0 text-[12px] text-brand'

const EMPTY = 'px-2 py-1 pl-7 text-[13px] text-muted-foreground'

/** Props for {@link RailTree}. */
export interface RailTreeProps {
  /** The plan this tree addresses, so every link is built against it. */
  readonly planId: string

  /** Every rail and its features, from `sidebarRails`. */
  readonly rails: readonly SidebarRail[]

  /** What an empty rail says, so the words live with the sidebar's other sentences. */
  readonly noFeatures: string
}

/**
 * Every rail and every feature on it: a name that selects, beside a link that opens.
 *
 * ### Two gestures, and they are deliberately different things
 *
 * Clicking a **name** selects — it checks a radio, which dims the rest of the graph through
 * `select-css.ts` and costs no navigation and no re-render. Clicking **Open** navigates to that subject's
 * drawer. Selecting is for looking, opening is for editing, and conflating them would mean every glance at
 * a rail cost a server round trip.
 *
 * That is why the name is a `<label>` and not a `<Link>`: the radio it drives sits immediately before it,
 * which is what lets the row highlight itself with `peer-checked:` — a static Tailwind class the scanner can
 * read — while the generated stylesheet handles dimming the canvas. `group-chips.tsx` pairs a radio with a
 * label the same way for the same reason.
 *
 * ### Every row carries `data-search`
 *
 * `sidebar-search.tsx` filters by reading it off the DOM rather than by being handed the rows: a client
 * component under `components/plan` may be given primitives, an unbound function or `null` and nothing else
 * (`../module-boundaries.test.tsx`), so an array of rows cannot cross that boundary. The canvas drag already
 * works this way — `canvas/selection.ts` rebuilds a whole `RailBox[]` out of the markup the server drew —
 * and this is the same trade for the same reason.
 *
 * It is lower-cased **here**, on the server, so the filter compares two lower-cased strings and does not
 * lower-case two hundred names on every keystroke.
 *
 * ### A rail with no features says so
 *
 * That row is the point rather than an edge case: a new rail is empty, and putting the first feature on it
 * is the next thing anybody does. A rail that simply had nothing under it would look like a rail whose
 * features had not loaded.
 */
export function RailTree({ planId, rails, noFeatures }: RailTreeProps) {
  return (
    <div className="grid gap-2" data-slot="rail-tree">
      {rails.map((rail) => (
        <div className={RAIL} data-slot="rail-branch" key={rail.id}>
          <input
            className="sr-only peer"
            id={railRadioId(rail.id)}
            name={SELECT_RADIO_NAME}
            type="radio"
          />
          <div className={RAIL_ROW} data-search={rail.name.toLowerCase()} data-slot="sidebar-row">
            <span className={SWATCH} style={rail.colour === '' ? undefined : { backgroundColor: rail.colour }} />
            <label className={NAME} htmlFor={railRadioId(rail.id)}>
              {rail.name}
            </label>
            <Link className={OPEN} href={railPath(planId, rail.id)}>
              Open
            </Link>
          </div>
          {rail.features.length === 0 ? <p className={EMPTY}>{noFeatures}</p> : null}
          {rail.features.map((feature) => (
            <span className="contents" key={feature.id}>
              <input
                className="sr-only peer"
                id={featureRadioId(feature.id)}
                name={SELECT_RADIO_NAME}
                type="radio"
              />
              <div
                className={FEATURE_ROW}
                data-search={feature.name.toLowerCase()}
                data-slot="sidebar-row"
              >
                <label className={FEATURE_NAME} htmlFor={featureRadioId(feature.id)}>
                  {feature.name}
                </label>
                <Link className={OPEN} href={featurePath(planId, feature.id)}>
                  Open
                </Link>
              </div>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
