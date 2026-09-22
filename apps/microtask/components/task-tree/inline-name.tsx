'use client'

import { LIMITS } from '@repo/contracts'
import { cn } from '@repo/ui/lib/utils'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ActionResult } from '../../actions/result'
import { orNoAnswer } from '@repo/app-session/no-answer'

/** Props for {@link InlineName}. */
export interface InlineNameProps {
  /** The stored name, as the server last returned it. */
  name: string
  /** The field's accessible name, such as `Project name`. */
  label: string
  /** Sends a rename and answers the name the server stored, or why it refused. */
  onRename: (name: string) => Promise<ActionResult<string>>
  /** Classes for the text itself, such as a heading's size and weight. */
  className?: string
  /** Whether to focus and select the field on mount, for a rename opened from a menu. */
  autoFocus?: boolean
  /** Called once the edit is over, committed or not. */
  onDone?: () => void
}

const FIELD =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 outline-none hover:border-border hover:bg-card focus:border-gold-deep focus:bg-card'

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

const useStoredName = (name: string) => {
  const field = useRef<HTMLInputElement>(null)
  const stored = useRef(name)
  const paint = useCallback((value: string) => {
    const input = field.current
    if (input !== null && input.ownerDocument.activeElement !== input) input.value = value
  }, [])
  useEffect(() => {
    stored.current = name
    paint(name)
  }, [name, paint])
  return { field, stored, paint }
}

const keyed = (event: KeyboardEvent<HTMLInputElement>, stored: string) => {
  if (event.key === 'Escape') event.currentTarget.value = stored
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    event.currentTarget.blur()
  }
}

/**
 * A name edited in place, by the rules the app being replaced used for its title.
 *
 * Enter commits and Escape reverts, both by leaving the field; leaving it commits. A value that
 * is empty, or unchanged once whitespace is collapsed, restores the stored name **with no
 * request**. What is shown afterwards is the name the server answered, never the typed one —
 * the server also collapses whitespace, so the two differ for real input.
 *
 * **The field is never written while it has focus.** Legacy guarded this explicitly: a re-render
 * driven by something else — a refresh after another control's write — would otherwise replace
 * what the user is typing mid-word. So the input is uncontrolled and every write goes through one
 * guarded painter, including the late answer to a rename the user has already moved past.
 *
 * `onRename` is called through `orNoAnswer`, so a rename the server never answers restores the
 * stored name and says so like a refusal, whichever surface handed the action in.
 */
export function InlineName({ name, label, onRename, className, autoFocus = false, onDone }: InlineNameProps) {
  const { field, stored, paint } = useStoredName(name)
  const [initial] = useState(name)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    if (autoFocus) field.current?.select()
  }, [autoFocus, field])
  const commit = async (input: HTMLInputElement) => {
    const next = collapse(input.value)
    if (next !== '' && next !== stored.current) {
      const result = await orNoAnswer(onRename)(next)
      if (result.ok) stored.current = result.value
      setProblem(result.ok ? '' : result.detail)
    }
    paint(stored.current)
    onDone?.()
  }
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <input
        aria-label={label}
        autoFocus={autoFocus}
        className={cn(FIELD, className)}
        defaultValue={initial}
        maxLength={LIMITS.nameLength}
        onBlur={(event) => void commit(event.currentTarget)}
        onKeyDown={(event) => keyed(event, stored.current)}
        ref={field}
        spellCheck={false}
        type="text"
      />
      {problem !== '' ? <span className="px-1.5 text-[12.5px] text-destructive" role="alert">{problem}</span> : null}
    </span>
  )
}
