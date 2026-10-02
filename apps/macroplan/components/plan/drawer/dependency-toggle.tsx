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
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature whose list of dependencies this click changes. */
  readonly featureId: string

  /** The candidate at the other end of the edge. */
  readonly candidateId: string

  /** Its name. */
  readonly candidateName: string

  /** Where it is and when it ends, as the row's sub-line. */
  readonly candidateWhere: string

  /** Its rail's hue, for the dot. */
  readonly candidateColour: string

  /** The whole stored list, joined, which is what a click is computed from. */
  readonly storedIds: string

  /** Why adding this edge would be refused, `''` where it would not. */
  readonly addRefusal: string

  /** Why removing it would be refused, `''` where it would not. */
  readonly removeRefusal: string

  /** The chip rendering, for an edge that is already set. */
  readonly chip: boolean

  /** The write, unbound: the whole next list of dependencies. */
  readonly setDependencies: SubjectWrite<readonly string[]>
}

/**
 * One dependency's write: the click, the refusal, and what the server said is stored now.
 *
 * The island is the toggle and not the list around it, which is what lets the rows carry a rail name,
 * a hue and an end date: those are server readings, and a client component holding the list would
 * have to be handed an array of objects (`./list-search.tsx` argues the same point for the search).
 *
 * `./edge-list.ts` holds the part that cannot live in one row: a click replaces the **whole** set, so
 * two quick clicks on two different rows have to build on each other rather than both on the list the
 * server last rendered. It keys that pending list by plan and feature, and {@link DependencyToggle}
 * forgets it whenever a fresh list arrives from the server with nothing in flight.
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
      chip={row.chip}
      colour={row.candidateColour}
      fieldId={`plan-drawer-depends-${row.candidateId}`}
      name={row.candidateName}
      onToggle={() => void commit()}
      problem={problem}
      refusal={problem === '' && refusal !== '' ? refusal : null}
      ticked={waiting}
      where={row.candidateWhere}
    />
  )
}
