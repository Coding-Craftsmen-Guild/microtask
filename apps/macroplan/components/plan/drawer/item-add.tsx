'use client'

import type { NewItem } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { LIMITS } from '@repo/contracts'
import { useRef, useState, type FormEvent } from 'react'
import { FIELD_PROBLEM } from './field-css'
import { NEEDS_A_NAME, type PlanCreate } from './field'
import { ITEMS } from './list-css'

/** The three strings the add row needs: a name for the box, its placeholder, and the button. */
export const ITEM_ADD_WORDS = {
  label: 'New item name',
  hint: 'New item…',
  action: 'Add',
} as const

/** Props for {@link ItemAdd}. */
export interface ItemAddProps {
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature the item is added to, which is the one this panel is open on. */
  readonly featureId: string

  /** The write, unbound. */
  readonly createItem: PlanCreate<NewItem>
}

/**
 * The last row of the items list: a name, and the button that adds it.
 *
 * ### Why it is a row and not a form under the box
 *
 * It is the end of the list, and reading it that way is the whole point: type a name where the next
 * item will appear, press Add, and it appears there. The field it replaced was a labelled box in a
 * bordered band under everything else, with a hint explaining where the item would land — which it had
 * to explain, because nothing on screen showed it.
 *
 * ### What it dropped
 *
 * "New feature on this rail", which lived beside it. A feature is created on the board now: dragged
 * from the Add strip onto a rail at the sprint it starts in, or drawn from a `+` handle on the feature
 * it follows. Both of those place the work as they create it, where this field could only ever add it
 * after the last one and then say so in a sentence.
 *
 * An item is still created here as well as on the board, and that is not the same asymmetry: an item
 * has an order inside its feature and no place of its own, so "after the last one" is the whole truth
 * about where it lands.
 */
export function ItemAdd({ planId, featureId, createItem }: ItemAddProps) {
  const box = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const commit = async () => {
    const name = (box.current?.value ?? '').trim()
    if (name === '') {
      setProblem(NEEDS_A_NAME)
      return
    }
    const result = await orNoAnswer(createItem)(planId, { featureId, name })
    setProblem(result.ok ? '' : result.detail)
    if (result.ok && box.current !== null) box.current.value = ''
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void commit()
  }
  return (
    <>
      <form className={ITEMS.add} data-slot="item-add" onSubmit={submit}>
        <input
          aria-label={ITEM_ADD_WORDS.label}
          className={ITEMS.addBox}
          maxLength={LIMITS.nameLength}
          placeholder={ITEM_ADD_WORDS.hint}
          ref={box}
          type="text"
        />
        <button className={ITEMS.addGo} type="submit">
          {ITEM_ADD_WORDS.action}
        </button>
      </form>
      {problem === '' ? null : (
        <p className={FIELD_PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
