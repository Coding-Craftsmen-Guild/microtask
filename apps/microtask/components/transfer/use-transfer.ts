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
import { stageDrop } from './stage-drop'

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
 * turns a refusal into a value for that reason; the rejection arm here is what is left over: a
 * `redirect` thrown through the action boundary, or the action machinery itself failing. Left
 * unhandled it would be a spinner that never stops.
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
  const failed = useCallback((reason: unknown) => {
    setAttempt((current) => said(current, String(reason)))
  }, [])
  const harvest = useCallback(
    (files: readonly HarvestedFile[]) => {
      setAttempt(harvesting(files))
      const ports_ = { open: onOpen, send: postChunk, expand: onExpand, preview: onPreview }
      void stageDrop(files, ports_).then((outcome) => {
        setAttempt((current) => stagedInto(current, outcome))
      }, failed)
    },
    [failed, onExpand, onOpen, onPreview],
  )
  const reject = useCallback((reason: unknown) => {
    setAttempt(harvestRefused(reason))
  }, [])
  const session = attempt.session?.sessionId ?? null
  const confirm = useCallback(
    (choices: readonly ProjectChoice[]) => {
      if (session === null) return
      setAttempt((current) => ({ ...current, busy: true }))
      void onConfirm(session, choices).then((answer) => {
        setAttempt((current) => (answer.ok ? applied(current, answer.value) : said(current, answer.detail)))
      }, failed)
    },
    [failed, onConfirm, session],
  )
  return { ...attempt, harvest, reject, confirm }
}
