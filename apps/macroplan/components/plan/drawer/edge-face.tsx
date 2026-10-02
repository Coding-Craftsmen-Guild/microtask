import { EDGES, EDGE_ROW } from './list-css'

const CROSS = String.fromCharCode(0x2715)

/** Props for {@link EdgeFace}. */
export interface EdgeFaceProps {
  /** The chip rendering, which is what a set edge looks like, rather than a row of the search. */
  readonly chip: boolean

  /** The candidate's name. */
  readonly name: string

  /** The id the checkbox names as its label, so the sub-line is not part of the control's name. */
  readonly nameId: string

  /** Where it is and when it ends, as the row's sub-line. */
  readonly where: string

  /** Why this edge cannot be set, which takes the sub-line's place; `null` where it can. */
  readonly why: string | null

  /** The id of that sub-line, which the checkbox names as its description. */
  readonly hintId: string
}

/**
 * What a dependency reads as: a name and a cross, or a name over a sub-line.
 *
 * The chip says "this is set, and here is how to unset it". The row says "this could be set, and here is
 * what it is" — a rail and the day the schedule has it finishing, which is the context behind *should*
 * this wait on that. The refusal takes the sub-line's place rather than being added to it, because the
 * two answer the same question and a row saying both would be saying "ends Oct 7, and also you cannot".
 *
 * The name carries the id the checkbox is labelled by, which is what keeps the sub-line out of the
 * control's accessible **name** and in its description where it belongs.
 */
export function EdgeFace({ chip, name, nameId, where, why, hintId }: EdgeFaceProps) {
  if (chip) {
    return (
      <>
        <span className={EDGES.name} data-slot="edge-name" id={nameId}>
          {name}
        </span>
        <span className={EDGES.cross}>{CROSS}</span>
      </>
    )
  }
  return (
    <span className={EDGE_ROW.body}>
      <span className={EDGE_ROW.name} data-slot="edge-name" id={nameId}>
        {name}
      </span>
      <span className={why === null ? EDGE_ROW.where : EDGE_ROW.why} id={hintId}>
        {why ?? where}
      </span>
    </span>
  )
}
