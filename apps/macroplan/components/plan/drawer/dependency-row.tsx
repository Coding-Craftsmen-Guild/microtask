import type { Ref } from 'react'
import { EdgeFace } from './edge-face'
import { FIELD_PROBLEM } from './field-css'
import { EDGES, EDGE_ROW } from './list-css'

const SR_ONLY = 'sr-only'

const GROUP = 'grid gap-0.5'

const faceClass = (chip: boolean, refusal: string | null): string => {
  if (chip) return EDGES.chip
  return refusal === null ? EDGE_ROW.open : EDGE_ROW.shut
}

const describedBy = (chip: boolean, hintId: string, problemId: string): string =>
  [chip ? '' : hintId, problemId].filter((one) => one !== '').join(' ')

/** Props for {@link DependencyRow}. */
export interface DependencyRowProps {
  /** The checkbox's id, which every id this row derives is built from. */
  readonly fieldId: string

  /** The candidate's name. */
  readonly name: string

  /** Where it is and when it ends, as the row's sub-line. */
  readonly where: string

  /** Its rail's hue, for the dot. */
  readonly colour: string

  /** Why this edge cannot be set, or `null` where it can. */
  readonly refusal: string | null

  /** What the last write was refused with, `''` for none. */
  readonly problem: string

  /** Whether this feature already waits on the candidate. */
  readonly ticked: boolean

  /** The chip rendering, which is what a set edge looks like, rather than a row of the search. */
  readonly chip: boolean

  /** Flip it. */
  readonly onToggle: () => void

  /** The box itself, so the island above can repaint it from what the server answered. */
  readonly boxRef: Ref<HTMLInputElement>
}

/**
 * One dependency, drawn either as a chip that is set or as a row that could be.
 *
 * ### Why both are the same checkbox
 *
 * A chip with a cross and a row in a search list are two views of one boolean: *does this feature wait
 * on that one*. Keeping one `input type="checkbox"` under both is what makes them agree — the same
 * write, the same refusal, the same re-read of what the server stored — and it is what a reader on a
 * screen reader hears, in both renderings, as "waits on Billing, checked".
 *
 * The box is `sr-only` and the `<label>` carries the paint, because neither shape can be drawn on a
 * native checkbox. Clicking the label is what toggles it, so the cross on a chip is not a second
 * control that could disagree with the first.
 *
 * ### Why a refused row is drawn at all, and why it is still clickable
 *
 * A row that would close a loop is **greyed and kept in place**, with the refusal where its sub-line
 * would be. The question a reader is asking is "can this wait on that", and a list that silently
 * omitted the answer would read as a plan that has lost a feature.
 *
 * It is greyed rather than `disabled`, which is the one place this row departs from the design. The
 * refusal is a **message and never a gate**: `./edge-list.ts` refuses the click itself and the API is
 * still the authority on the write, so a row that could not be clicked at all would be this app
 * deciding an answer the server owns. The cursor says it will not work, the sub-line says why, and a
 * click says it again as an alert.
 */
export function DependencyRow(props: DependencyRowProps) {
  const { fieldId, name, where, colour, refusal, problem, ticked, chip, onToggle, boxRef } = props
  const nameId = `${fieldId}-name`
  const hintId = `${fieldId}-hint`
  const problemId = `${fieldId}-problem`
  const described = describedBy(chip, hintId, problem === '' ? '' : problemId)
  return (
    <div className={GROUP}>
      <label
        className={faceClass(chip, refusal)}
        title={chip && refusal !== null ? refusal : undefined}
      >
        <input
          aria-describedby={described === '' ? undefined : described}
          aria-invalid={problem === '' ? undefined : true}
          aria-labelledby={nameId}
          className={SR_ONLY}
          defaultChecked={ticked}
          id={fieldId}
          onChange={onToggle}
          ref={boxRef}
          type="checkbox"
        />
        <span className={EDGES.dot} style={colour === '' ? undefined : { backgroundColor: colour }} />
        <EdgeFace
          chip={chip}
          hintId={hintId}
          name={name}
          nameId={nameId}
          where={where}
          why={refusal}
        />
      </label>
      {problem === '' ? null : (
        <p className={FIELD_PROBLEM} id={problemId} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
