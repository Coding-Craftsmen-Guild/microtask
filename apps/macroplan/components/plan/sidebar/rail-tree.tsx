import type { AttentionMap } from '../attention/attention'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { featureRadioId, railRadioId } from './select-css'
import { TREE } from './sidebar-css'
import type { SidebarRail } from './sidebar-rows'
import { TreeRadio, TreeRow } from './tree-row'

/** Props for {@link RailTree}. */
export interface RailTreeProps {
  readonly root: string

  readonly routes: DrawerRoutes

  readonly rails: readonly SidebarRail[]

  readonly noFeatures: string

  readonly found: AttentionMap
}

/**
 * The rails and their features, as a tree that selects on the chip and navigates on the name.
 *
 * ### The overflow this fixes
 *
 * The first revision's rows were `flex` with the name on `flex-1 truncate` and a separate `Open`
 * link beside it. `flex-1` is `flex: 1 1 0%` and does **not** set `min-width: 0`, so the name kept
 * its automatic content minimum, refused to shrink, and pushed the row past the 17rem column. The
 * grid track did not clip it, so `Open` links landed on top of the canvas and rail names were
 * painted over by it. Every row carries `min-w-0` explicitly now, and the name **is** the link, so
 * there is nothing beside it to push out.
 *
 * ### Selection versus navigation
 *
 * Clicking a row's colour chip checks a hidden radio and the generated sheet in `select-css.ts` dims
 * everything else on the canvas — no state, no round trip. Clicking the name navigates to that
 * entity's drawer. Two gestures on one row, which is what the tree needs: highlighting a rail to
 * find it on the board is a different intent from opening it to edit it.
 */
export function RailTree({ root, routes, rails, noFeatures, found }: RailTreeProps) {
  return (
    <div className={TREE.root} data-slot="rail-tree">
      {rails.map((rail) => (
        <div className={TREE.branch} data-slot="rail-branch" key={rail.id}>
          <TreeRadio radioId={railRadioId(rail.id)} />
          <TreeRow
            colour={rail.colour}
            found={found}
            href={routes.rail === null ? null : routes.rail(root, rail.id)}
            id={rail.id}
            kind="rail"
            name={rail.name}
            radioId={railRadioId(rail.id)}
          />
          {rail.features.length === 0 ? <p className={TREE.empty}>{noFeatures}</p> : null}
          {rail.features.map((feature) => (
            <span className="contents" key={feature.id}>
              <TreeRadio radioId={featureRadioId(feature.id)} />
              <TreeRow
                found={found}
                href={routes.feature(root, feature.id)}
                id={feature.id}
                kind="feature"
                name={feature.name}
                radioId={featureRadioId(feature.id)}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
