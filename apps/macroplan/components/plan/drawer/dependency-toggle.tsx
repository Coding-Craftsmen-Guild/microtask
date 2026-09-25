'use client'

import { useEffect, useRef, useState } from 'react'
import { forgetEdges, toggleEdge } from './edge-list'
import { splitEdges, type SubjectWrite } from './field'
import { FieldShell } from './field-shell'

const BOX = 'size-4'

const paint = (box: HTMLInputElement | null, ticked: boolean): void => {
  if (box !== null) box.checked = ticked
}

/** Props for {@link DependencyToggle}. */
export interface DependencyToggleProps {
  /** The plan this write is addressed at. */
  readonly planId: string

  /** The feature whose dependency list this row edits — the subject the drawer is open on. */
  readonly featureId: string

  /** The candidate feature this row is about, which is also what makes this control's id unique. */
  readonly candidateId: string

  /** The candidate's name, which is this control's accessible name and the only label it has. */
  readonly candidateName: string

  /** The subject's whole list as this render found it, joined — `splitEdges` is what undoes it. */
  readonly storedIds: string

  /** Why adding this candidate would be refused, worked out on the server, or `''`. */
  readonly addRefusal: string

  /** Why removing it would be refused — a cycle the plan already holds refuses either — or `''`. */
  readonly removeRefusal: string

  /** Replaces the subject's whole list and answers the plan, or why it was refused. */
  readonly setDependencies: SubjectWrite<readonly string[]>
}

/**
 * One feature this one could wait on, as a box that is ticked while the edge is stated.
 *
 * ### A row rather than a list, because a list cannot cross this boundary
 *
 * The candidates are a **list of features** and a client component may be handed primitives, an
 * unbound function or `null` and nothing else (`../module-boundaries.test.tsx`), so the list never
 * crosses: `./dependency-editor.tsx` stays on the server, walks the graph twice per candidate, and
 * mounts one of these per row with that row's own strings. What arrives here is seven primitives and
 * one action, and this component cannot see another feature, another edge or the plan.
 *
 * `storedIds` is the one of them that is a list in disguise, and {@link splitEdges} is where the
 * reason lives: `PUT .../dependencies` replaces the whole set, so a click has to send the subject's
 * entire list, and the string is how the list a space-free id alphabet makes safe to join gets here.
 * It is the list **this render found**, not the list this click sends: which of the two writes a
 * click means, and what it adds it to, is `./edge-list.ts`'s answer.
 *
 * ### Both refusals, and the click chooses
 *
 * A row is drawn once and may be clicked twice, so the write a box means is not fixed at render
 * time: a box ticked by the last click is a box whose next click removes an edge. Both refusals are
 * therefore carried, the one for adding and the one for removing, and {@link toggleEdge} picks
 * against what this browser has actually sent. That is also the immediate undo — a second click on
 * the same box takes the edge back rather than re-sending it and snapping the box to ticked again.
 *
 * ### The refusal is a message, never a gate
 *
 * A refusal is the local check's answer, and the API is still the authority: the write is sent in
 * every case the local check passes, and whatever comes back — a 403 for a seat re-roled since the
 * render, a 422, a 409 — is rendered under this box. What the local check buys is the one refusal the
 * API cannot say in front of a user: a cycle is a 409, `lib/problem.ts` answers every refusal with
 * the audience's plain sentence for its status and never the API's `detail`, so a cycle sent to the
 * server would come back as "Someone else changed this at the same time. Reload the page and try
 * again." That sentence is now **true** whenever it appears here — after this control, a 409 on this
 * route can only mean the plan this page rendered is not the plan the server holds — which is why the
 * cycle is caught before the send rather than by carving an exception into that file's rule.
 *
 * ### Two renders of one feature lose a write, and nothing detects it
 *
 * The route takes no `If-Match`, so two **renders** of one feature's edges each send a complete list
 * built from the plan they found, the second silently overwrites the first, and nothing tells either
 * of them (`packages/api-client/src/operations/features.ts`). Two people is the visible case and not
 * the likeliest one: one person clicking two boxes on one screen was the same mechanism, and it is
 * `./edge-list.ts` that closes it by building every click on the list the last click sent. What is
 * left is what a single browser cannot see — another editor's write between this render and this
 * click — and nothing here can fix that; what it does instead is read the answer back.
 *
 * ### The box shows what the server stored
 *
 * The drawer's field idiom, as `./pin-field.tsx` argues it: the box is uncontrolled and written
 * through a ref, and a successful write re-reads this one edge out of the plan that write answered
 * with rather than assuming the list it sent. A refusal puts the box back where this browser's list
 * has it, so a tick that was not accepted is not left on screen. `adminWrite` also calls `refresh()`
 * on success, which re-renders the route and re-props every row from the plan the server now holds;
 * the read-back is what keeps this one box right in the meantime, and the effect is what lets that
 * re-render move a box React would otherwise leave alone — `defaultChecked` is read once.
 */
export function DependencyToggle(row: DependencyToggleProps) {
  const box = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const waiting = splitEdges(row.storedIds).includes(row.candidateId)
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
    <FieldShell
      fieldId={`plan-drawer-depends-${row.candidateId}`}
      hint={null}
      label={row.candidateName}
      problem={problem}
    >
      {(wiring) => (
        <input
          {...wiring}
          className={BOX}
          defaultChecked={waiting}
          onChange={() => void commit()}
          ref={box}
          type="checkbox"
        />
      )}
    </FieldShell>
  )
}
