import { PlanLink } from '../nav/plan-nav'
import { openedHref, type TabRef } from './tab-stack'
import { BAND, EDGES } from './list-css'
import { PANEL_BANDS } from './panel-words'
import type { EdgeCandidate } from './values'

const ARROW = String.fromCharCode(0x2192)

/** Props for {@link UnblocksBand}. */
export interface UnblocksBandProps {
  /** The features that wait on this one. */
  readonly rows: readonly EdgeCandidate[]

  /** The plan's own path, which every chip's link hangs off. */
  readonly root: string

  /** The tabs open beside this one, so a chip joins the stack (`./tab-stack.ts`). */
  readonly stack: readonly TabRef[]
}

/**
 * What waits on this feature, which is the same relation read from the other end.
 *
 * It is **not** editable here and the paint says so: flat strip-coloured chips with an arrow, where
 * the band above has outlined chips with a cross. That is not a capability difference, it is where the
 * write lives — "Billing waits on this" is a field of *Billing*, so the way to remove it is to open
 * Billing and untick this feature. Each chip is the link that gets you there.
 *
 * Reading it here matters because it is the half a reader cannot deduce: a feature's own panel knows
 * what it waits on, and nothing on screen would otherwise say what is waiting on **it** — which is the
 * question behind "can this slip".
 */
export function UnblocksBand({ rows, root, stack }: UnblocksBandProps) {
  return (
    <section className={BAND.root} data-slot="unblocks-band">
      <p className={BAND.title}>{PANEL_BANDS.unblocks}</p>
      <p className={BAND.sub}>{PANEL_BANDS.unblocksSub}</p>
      {rows.length === 0 ? <p className={BAND.empty}>{PANEL_BANDS.noUnblocks}</p> : null}
      {rows.length === 0 ? null : (
        <div className={EDGES.chips}>
          {rows.map((row) => (
            <PlanLink
              className={EDGES.flat}
              href={openedHref(root, { id: row.id, kind: 'feature' }, stack)}
              key={row.id}
              title={`${row.railName} ${ARROW} ${row.name}`}
            >
              <span
                className={EDGES.dot}
                style={row.colour === '' ? undefined : { backgroundColor: row.colour }}
              />
              <span className={EDGES.name}>{row.name}</span>
              <span className={EDGES.arrow}>{ARROW}</span>
            </PlanLink>
          ))}
        </div>
      )}
    </section>
  )
}
