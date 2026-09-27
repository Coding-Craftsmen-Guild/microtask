'use client'

import { useEffect, useRef, useState } from 'react'
import { DependencyRow } from './dependency-row'
import { forgetEdges, toggleEdge } from './edge-list'
import { splitEdges, type SubjectWrite } from './field'

const paint = (box: HTMLInputElement | null, ticked: boolean): void => {
  if (box !== null) box.checked = ticked
}

/** Props for {@link DependencyToggle}. */
export interface DependencyToggleProps {
  readonly planId: string

  readonly featureId: string

  readonly candidateId: string

  readonly candidateName: string

  readonly storedIds: string

  readonly addRefusal: string

  readonly removeRefusal: string

  readonly setDependencies: SubjectWrite<readonly string[]>
}

/**
 * One candidate this feature could wait on, as a checkbox that writes the whole list.
 *
 * ### Still no gate
 *
 * A box whose click would close a cycle is **not** disabled. It carries the reason as its
 * description and refuses the click locally when it comes. A disabled checkbox is skipped by
 * keyboard navigation and announces nothing about why it cannot be used, so the reader who most
 * needs the explanation is the one who never reaches it.
 *
 * ### A row, not a stacked field
 *
 * The name sits beside its box rather than above it, which is what a list of checkboxes is and what
 * halves the height of an editor offering one per feature in the plan. `DependencyRow` is the
 * markup; this is the write, and splitting them is what keeps each inside this repo's caps.
 */
export function DependencyToggle(row: DependencyToggleProps) {
  const box = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const waiting = splitEdges(row.storedIds).includes(row.candidateId)
  const refusal = waiting ? row.removeRefusal : row.addRefusal
  useEffect(() => {
    forgetEdges(row.planId, row.featureId)
    paint(box.current, splitEdges(row.storedIds).includes(row.candidateId))
  }, [row.candidateId, row.featureId, row.planId, row.storedIds])
  const commit = async () => {
    const answer = await toggleEdge({
      addRefusal: row.addRefusal,
      candidateId: row.candidateId,
      featureId: row.featureId,
      planId: row.planId,
      removeRefusal: row.removeRefusal,
      storedIds: row.storedIds,
      write: row.setDependencies,
    })
    paint(box.current, answer.ticked)
    setProblem(answer.problem)
  }
  return (
    <DependencyRow
      boxRef={box}
      fieldId={`plan-drawer-depends-${row.candidateId}`}
      name={row.candidateName}
      onToggle={() => void commit()}
      problem={problem}
      refusal={problem === '' && refusal !== '' ? refusal : null}
      ticked={waiting}
    />
  )
}
