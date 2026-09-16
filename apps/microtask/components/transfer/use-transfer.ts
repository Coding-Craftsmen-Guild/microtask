'use client'

import type { Decoded } from '@repo/api-client'
import type {
  ImportConfirmResult,
  ImportPreview,
  ImportProjectChoice,
  ImportSession,
} from '@repo/contracts'
import type { HarvestedFile, ProjectChoice } from '@repo/ui/transfer/vocabulary.js'
import { useCallback, useState } from 'react'
import type { ActionResult } from '../../actions/result'
import { applied, harvestRefused, harvesting, IDLE, said, stagedInto, type Attempt } from './attempt'
import { postChunk } from './post-chunk'
import { stageDrop, type DropOutcome } from './stage-drop'

/** The four calls the console makes, handed in as the Server Actions that serve them. */
export interface TransferPorts {
  /** Opens a staged session and answers the caps the browser slices by. */
  readonly onOpen: () => Promise<ActionResult<Decoded<typeof ImportSession>>>

  /** Expands one staged archive (ADR 0020). */
  readonly onExpand: (sessionId: string, path: string) => Promise<ActionResult<unknown>>

  /** Reads the plan for a staged session. */
  readonly onPreview: (sessionId: string) => Promise<ActionResult<Decoded<typeof ImportPreview>>>

  /** Applies a staged session under the choices collected. */
  readonly onConfirm: (
    sessionId: string,
    choices: readonly Decoded<typeof ImportProjectChoice>[],
  ) => Promise<ActionResult<Decoded<typeof ImportConfirmResult>>>
}

/** One import attempt, and the three things the console can do to it. */
export interface Transfer extends Attempt {
  /** Takes a harvest that **succeeded** and stages it. */
  readonly harvest: (files: readonly HarvestedFile[]) => void

  /** Takes a harvest that **failed** and says so, staging nothing. */
  readonly reject: (reason: unknown) => void

  /** Applies the staged session under the choices the panel collected. */
  readonly confirm: (choices: readonly ProjectChoice[]) => void
}

/**
 * Holds one import attempt and drives the four calls it is made of.
 *
 * Every transition is a pure function in `attempt.ts`, so what the console renders after a
 * refusal is decided somewhere a test can call directly, and this hook is only the wiring: which
 * call, in which order, and which transition its two settlements take.
 *
 * Both settlements are handled for every call — the answer *and* a rejection — because a Server
 * Action's rejection reaches the browser as an opaque digest in production. `adminCall` already
 * turns a refusal into a value for that reason; the rejection arm here is what is left over, and
 * it is reachable rather than defensive: `adminCall` answers a 401 and a missing session by
 * calling `redirect`, which **works by throwing**, so it arrives here as a rejection and not as a
 * result. Left unhandled it is `Working…` on screen for as long as the tab is open, with no
 * sentence saying why.
 *
 * The two rejections take **different** transitions, for the same reason their successes do. A
 * staging run that rejected staged nothing, so it drops `harvested` and renders a sentence where
 * the panel would be — a panel over a drop that never reached a session would say "1 file
 * harvested" above "Nothing has been previewed yet", which is the shape ADR 0018 is about. A
 * confirm that rejected keeps the plan, because the session survives until an apply begins
 * (ADR 0045) and the admin's next move is to change a choice and try again.
 *
 * `confirm` reads the session off the attempt rather than taking one, so a confirm can only ever
 * apply the session whose plan is on screen.
 *
 * @param ports - The Server Actions the page handed down.
 * @returns The attempt to render, plus harvest, reject and confirm.
 */
export function useTransfer(ports: TransferPorts): Transfer {
  const [attempt, setAttempt] = useState<Attempt>(IDLE)
  const { onOpen, onExpand, onPreview, onConfirm } = ports
  const harvest = useCallback(
    (files: readonly HarvestedFile[]) => {
      setAttempt(harvesting(files))
      const into = { open: onOpen, send: postChunk, expand: onExpand, preview: onPreview }
      const settle = (outcome: DropOutcome): void => {
        setAttempt((current) => stagedInto(current, outcome))
      }
      void stageDrop(files, into).then(settle, (reason: unknown) => {
        settle({ ok: false, detail: String(reason) })
      })
    },
    [onExpand, onOpen, onPreview],
  )
  const reject = useCallback((reason: unknown) => {
    setAttempt(harvestRefused(reason))
  }, [])
  const session = attempt.session?.sessionId ?? null
  const confirm = useCallback(
    (choices: readonly ProjectChoice[]) => {
      if (session === null) return
      setAttempt((current) => ({ ...current, busy: true }))
      const stop = (detail: string): void => {
        setAttempt((current) => said(current, detail))
      }
      void onConfirm(session, choices).then((answer) => {
        if (answer.ok) setAttempt((current) => applied(current, answer.value))
        else stop(answer.detail)
      }, (reason: unknown) => {
        stop(String(reason))
      })
    },
    [onConfirm, session],
  )
  return { ...attempt, harvest, reject, confirm }
}
