import { DependencyEditor } from './dependency-editor'
import type { PanelParts } from './panel-parts'
import { PANEL_GRID } from './panel-css'
import { UnblocksBand } from './unblocks-band'

/** Props for {@link EdgesColumn}. */
export interface EdgesColumnProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * The second column of a feature: both ends of its dependencies.
 *
 * Two bands rather than one list, because they are two different things that happen to be the same
 * relation. **Waits for** is a field of this feature and is edited here. **Unblocks** is a field of
 * other features, read from this end, and is links rather than controls (`./unblocks-band.tsx` argues
 * it). Putting them in one column is what answers the question behind both: can this slip, and what
 * happens if it does.
 *
 * The whole column is behind `setDependencies`: a surface that may not set an edge is shown neither
 * band, because the half it could still read is the half that would leave it looking at a column with
 * one empty list in it.
 */
export function EdgesColumn({ parts }: EdgesColumnProps) {
  const { row, values, controls, actions, planId, closeHref } = parts
  if (row.kind !== 'feature' || !controls.setDependencies) return null
  return (
    <div className={PANEL_GRID.split} data-slot="panel-edges">
      <DependencyEditor
        candidates={values.panel.candidates}
        featureId={row.id}
        features={values.plan.features}
        planId={planId}
        setDependencies={actions.setDependencies}
      />
      <UnblocksBand root={closeHref} rows={values.panel.unblocks} stack={parts.stack} />
    </div>
  )
}
