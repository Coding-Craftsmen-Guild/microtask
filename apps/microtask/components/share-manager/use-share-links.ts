'use client'

import type { NewShareLink, ShareLinkChange } from '@repo/api-client'
import { useCallback, useRef, useState } from 'react'
import type { ActionResult } from '../../actions/result'
import { revokedNotice } from './labels'
import type { Link, ShareActions } from './types'

/** Where the list is: not asked for, on its way, shown, or refused. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

/** The manager's links and everything that changes them. */
export interface ShareLinks {
  /** The links, once loaded; the ones minted this session for a holder who cannot list. */
  readonly links: readonly Link[]
  /** Where the list is. */
  readonly state: LoadState
  /** The last refusal, or `''`. */
  readonly problem: string
  /** The last success worth saying, or `''`. */
  readonly notice: string
  /** Asks for the links — the moment a token first reaches this browser. */
  readonly load: () => Promise<void>
  /** Drops every link held, so no token outlives the dialog that showed it. */
  readonly forget: () => void
  /** Mints a link, answering whether it was minted. */
  readonly create: (seat: NewShareLink) => Promise<boolean>
  /** Renames a link or changes its role. */
  readonly update: (token: string, change: ShareLinkChange) => Promise<void>
  /** Revokes a link and the links minted through it. */
  readonly revoke: (token: string) => Promise<void>
}

/**
 * The share manager's state: links held only while the dialog is open.
 *
 * `load` is called on open and `forget` on close, so a token is in this browser only between the
 * two (ADR 0033). An answer that arrives after the dialog closed is dropped rather than put back —
 * that is what `generation` is for — so closing the dialog mid-request cannot leave tokens behind.
 *
 * A holder who may not list (`listable` false) is never asked about: its list is the links it
 * minted in this session, each shown once, which is the only time its token is handed back.
 */
export function useShareLinks(projectId: string, actions: ShareActions, listable: boolean): ShareLinks {
  const [links, setLinks] = useState<readonly Link[]>([])
  const [state, setState] = useState<LoadState>('idle')
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const answered = async <Value>(request: Promise<ActionResult<Value>>, said: (value: Value) => string) => {
    const asked = generation.current
    const result = await request
    if (asked !== generation.current) return null
    setProblem(result.ok ? '' : result.detail)
    setNotice(result.ok ? said(result.value) : '')
    return result.ok ? result : null
  }
  const load = useCallback(async () => {
    generation.current += 1
    const asked = generation.current
    setState(listable ? 'loading' : 'ready')
    if (!listable) return
    const result = await actions.list(projectId)
    if (asked !== generation.current) return
    setLinks(result.ok ? result.value : [])
    setProblem(result.ok ? '' : result.detail)
    setState(result.ok ? 'ready' : 'failed')
  }, [actions, listable, projectId])
  const forget = useCallback(() => {
    generation.current += 1
    setLinks([])
    setState('idle')
    setProblem('')
    setNotice('')
  }, [])
  const create = async (seat: NewShareLink) => {
    const made = await answered(actions.create(projectId, seat), () => 'Link created.')
    if (made !== null) setLinks((held) => [...held, made.value])
    return made !== null
  }
  const update = async (token: string, change: ShareLinkChange) => {
    const changed = await answered(actions.update(projectId, token, change), () => '')
    if (changed !== null) setLinks((held) => held.map((one) => (one.token === token ? changed.value : one)))
  }
  const revoke = async (token: string) => {
    const revoked = await answered(actions.revoke(projectId, token), (gone) => revokedNotice(gone.length))
    if (revoked === null) return
    const gone = new Set(revoked.value.map((one) => one.token))
    setLinks((held) => held.filter((one) => !gone.has(one.token)))
  }
  return { links, state, problem, notice, load, forget, create, update, revoke }
}
