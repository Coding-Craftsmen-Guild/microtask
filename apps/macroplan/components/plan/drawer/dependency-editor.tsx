import { edgeChoices, type CycleFeature } from './cycle-check'
import { DependencyToggle } from './dependency-toggle'
import { splitEdges, type SubjectWrite } from './field'
import { BAND, EDGES } from './list-css'
import { PANEL_BANDS } from './panel-words'
import type { EdgeCandidate } from './values'
import { WaitsSearch } from './waits-search'

const whereOf = (candidate: EdgeCandidate): string =>
  candidate.ends === ''
    ? candidate.railName
    : `${candidate.railName} ${String.fromCharCode(0xb7)} ends ${candidate.ends}`

/** Props for {@link DependencyEditor}. */
export interface DependencyEditorProps {
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature whose dependencies these are. */
  readonly featureId: string

  /** Every feature of the plan, which is the graph a cycle is a property of. */
  readonly features: readonly CycleFeature[]

  /** The same features worded for a chip and a row: rail, hue, end date (`./subject-view.ts`). */
  readonly candidates: readonly EdgeCandidate[]

  /** The write, unbound. */
  readonly setDependencies: SubjectWrite<readonly string[]>
}

/**
 * What this feature waits on: the edges it has, and a search for one more.
 *
 * ### What this replaced
 *
 * Every other feature of the plan, as a checkbox, all of them on screen at once. That is unusable at
 * thirty features and misleading at three: a list of ticked and unticked boxes gives equal weight to
 * the two edges that exist and the twenty-eight that do not, when the first question a reader has is
 * *what does this wait on*. Now the set is chips, the alternatives are behind one Add, and the search
 * is what makes a long plan navigable.
 *
 * ### Why the search list is server-rendered
 *
 * Each row carries the candidate's rail, that rail's hue and the day the schedule has it finishing —
 * three readings that each take a second record — and whether the edge would close a loop, which is a
 * property of the whole graph. `./subject-view.ts` resolves the first three and `./cycle-check.ts` the
 * last, both on the server; the browser gets one island per row and a box that hides the rows that do
 * not match (`./list-search.tsx`).
 *
 * ### Why it opens in flow
 *
 * The panel body scrolls. A floating list opened from a column near the bottom of it would be clipped
 * with no way to reach the rest, which is why the design calls for this one to be inline.
 */
export function DependencyEditor(props: DependencyEditorProps) {
  const { planId, featureId, features, candidates, setDependencies } = props
  const { rows, storedIds } = edgeChoices(features, featureId)
  const waiting = new Set(splitEdges(storedIds))
  const shown = candidates.filter((one) => rows.some((each) => each.featureId === one.id))
  const toggle = (candidate: EdgeCandidate, chip: boolean) => {
    const choice = rows.find((each) => each.featureId === candidate.id)
    return (
      <DependencyToggle
        addRefusal={choice?.addRefusal ?? ''}
        candidateColour={candidate.colour}
        candidateId={candidate.id}
        candidateName={candidate.name}
        candidateWhere={whereOf(candidate)}
        chip={chip}
        featureId={featureId}
        key={candidate.id}
        planId={planId}
        removeRefusal={choice?.removeRefusal ?? ''}
        setDependencies={setDependencies}
        storedIds={storedIds}
      />
    )
  }
  const set = shown.filter((one) => waiting.has(one.id))
  const rest = shown.filter((one) => !waiting.has(one.id))
  return (
    <section className={BAND.root} data-slot="waits-band">
      <p className={BAND.title}>{PANEL_BANDS.waits}</p>
      <p className={BAND.sub}>{PANEL_BANDS.waitsSub}</p>
      {set.length === 0 ? <p className={BAND.empty}>{PANEL_BANDS.noWaits}</p> : null}
      {set.length === 0 ? null : (
        <div className={EDGES.chips}>{set.map((one) => toggle(one, true))}</div>
      )}
      {rest.length === 0 ? null : (
        <WaitsSearch>
          {rest.map((one) => (
            <div data-pick-row data-search={one.name.toLowerCase()} key={one.id}>
              {toggle(one, false)}
            </div>
          ))}
        </WaitsSearch>
      )}
    </section>
  )
}
