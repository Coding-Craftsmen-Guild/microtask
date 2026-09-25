'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useEffect, useRef, useState } from 'react'
import { splitEdges, type SubjectWrite } from './field'
import { FieldShell } from './field-shell'
import { waitsOn } from './values'

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

  /** Whether the subject already waits on the candidate, as the plan stores it. */
  readonly waiting: boolean

  /** The **whole** list this click would send, joined — `splitEdges` is what undoes it. */
  readonly sendIds: string

  /** Why this click would be refused, worked out on the server, or `''` when it would not. */
  readonly refusal: string

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
 * crosses: `./dependency-editor.tsx` stays on the server, walks the graph once per candidate, and
 * mounts one of these per row with that row's own strings. What arrives here is six primitives and
 * one action, and this component cannot see another feature, another edge or the plan.
 *
 * `sendIds` is the one of them that is a list in disguise, and {@link splitEdges} is where the
 * reason lives: `PUT .../dependencies` replaces the whole set, so a click has to send the subject's
 * entire list, and the string is how the list a space-free id alphabet makes safe to join gets here.
 * The list is **built on the server** rather than assembled here from a current list plus a
 * candidate, so what is sent and what was checked for a cycle are the same list by construction.
 *
 * ### The refusal is a message, never a gate
 *
 * `refusal` is the local check's answer, and the API is still the authority: the write is sent in
 * every case the local check passes, and whatever comes back — a 403 for a seat re-roled since the
 * render, a 422, a 409 — is rendered under this box. What the local check buys is the one refusal the
 * API cannot say in front of a user: a cycle is a 409, `lib/problem.ts` answers every refusal with
 * the audience's plain sentence for its status and never the API's `detail`, so a cycle sent to the
 * server would come back as "Someone else changed this at the same time. Reload the page and try
 * again." That sentence is now **true** whenever it appears here — after this control, a 409 on this
 * route can only mean the plan this page rendered is not the plan the server holds — which is why the
 * cycle is caught before the send rather than by carving an exception into that file's rule.
 *
 * ### Two editors on one feature lose a write, and nothing detects it
 *
 * The route takes no `If-Match`, so two people editing one feature's edges from the same rendered
 * plan each send a complete list and the second silently overwrites the first
 * (`packages/api-client/src/operations/features.ts`). Nothing here can fix that; what it does instead
 * is read the answer back.
 *
 * ### The box shows what the server stored
 *
 * The drawer's field idiom, as `./pin-field.tsx` argues it: the box is uncontrolled and written
 * through a ref, `stored` holds what the server last confirmed, and a successful write re-reads this
 * one edge out of the plan that write answered with ({@link waitsOn}) rather than assuming the list
 * it sent. A refusal puts the box back where the stored list has it, so a tick that was not accepted
 * is not left on screen. `adminWrite` also calls `refresh()` on success, which re-renders the route
 * and re-props every row from the plan the server now holds; the read-back is what keeps this one box
 * right in the meantime, and the effect is what lets that re-render move a box React would otherwise
 * leave alone — `defaultChecked` is read once.
 */
export function DependencyToggle({
  planId,
  featureId,
  candidateId,
  candidateName,
  waiting,
  sendIds,
  refusal,
  setDependencies,
}: DependencyToggleProps) {
  const box = useRef<HTMLInputElement>(null)
  const stored = useRef(waiting)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    stored.current = waiting
    paint(box.current, waiting)
  }, [waiting])
  const commit = async () => {
    if (refusal !== '') {
      paint(box.current, stored.current)
      setProblem(refusal)
      return
    }
    const result = await orNoAnswer(setDependencies)(planId, featureId, splitEdges(sendIds))
    if (result.ok) stored.current = waitsOn(result.value, featureId, candidateId)
    paint(box.current, stored.current)
    setProblem(result.ok ? '' : result.detail)
  }
  return (
    <FieldShell
      fieldId={`plan-drawer-depends-${candidateId}`}
      hint={null}
      label={candidateName}
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
