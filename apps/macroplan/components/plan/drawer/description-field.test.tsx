import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { MAX_ITEM_DESCRIPTION_BYTES } from '@repo/contracts'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { DescriptionField } from './description-field'

type Describe = (
  planId: string,
  itemId: string,
  description: string,
) => Promise<ActionResult<Plan>>

const served: ActionResult<Plan> = { ok: true, value: atlasPlan() }

const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' })

const budget = () => screen.getByText(/bytes/).textContent ?? ''

const setup = (description = 'Ship behind a flag', describe: Describe = () => Promise.resolve(served)) => {
  const onDescribe = vi.fn(describe)
  const view = render(
    <DescriptionField
      describe={onDescribe}
      description={description}
      itemId={ITEM_1}
      planId={PLAN_A}
    />,
  )
  return { onDescribe, view, user: userEvent.setup() }
}

// `user.type` on eight thousand characters is minutes of work for nothing: what is under test is the
// count and the refusal, not the typing. `fireEvent.change` sets the value the way a paste does, which
// is also the gesture a description this long really arrives by.
const paste = async (text: string) => {
  await act(async () => {
    fireEvent.change(box(), { target: { value: text } })
    fireEvent.blur(box())
  })
}

describe('a description counted in the unit its cap is written in', () => {
  it('shows what the item’s own file holds', () => {
    setup()
    expect(box().value).toBe('Ship behind a flag')
  })

  it('says what is left of the budget from the first keystroke, not only at the cap', async () => {
    const { user } = setup('')
    expect(budget()).toBe('8192 of 8192 bytes left')
    await user.type(box(), 'abc')
    expect(budget()).toBe('8189 of 8192 bytes left')
  })

  it('counts a multi-byte character as the bytes it costs, not the units it is written in', async () => {
    const { user } = setup('')
    await user.type(box(), '😀')
    expect(budget()).toBe('8188 of 8192 bytes left')
    expect(box().value.length).toBe(2)
  })

  it('counts a two-byte character as two, so anything but ASCII is counted honestly', async () => {
    const { user } = setup('')
    await user.type(box(), 'é')
    expect(budget()).toBe('8190 of 8192 bytes left')
  })

  it('says how far past the cap it has gone once it is past it', async () => {
    setup('')
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES + 12))
    expect(budget()).toBe('12 bytes over the 8192-byte cap')
  })
})

describe('what it sends, and what it refuses because the API would accept it silently', () => {
  it('replaces the description in full, addressed at the plan and the item', async () => {
    const { onDescribe, user } = setup('Ship behind a flag')
    await user.clear(box())
    await user.type(box(), 'Ship it')
    await user.tab()
    expect(onDescribe).toHaveBeenCalledWith(PLAN_A, ITEM_1, 'Ship it')
  })

  it('sends nothing when the text was not changed', async () => {
    const { onDescribe, user } = setup('Ship behind a flag')
    await user.click(box())
    await user.tab()
    expect(onDescribe).not.toHaveBeenCalled()
  })

  it('sends a description that fills the budget exactly', async () => {
    const { onDescribe } = setup('')
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES))
    expect(onDescribe).toHaveBeenCalledTimes(1)
  })

  it('refuses one byte over the cap and says what the API would have done with it', async () => {
    const { onDescribe } = setup('')
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES + 1))
    expect(onDescribe).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('drops the rest without saying so')
  })

  // The whole reason the counter is a byte counter: 2,049 emoji are 8,196 bytes and 4,098 UTF-16
  // units, so a `.length` check reads them as half the budget and sends them, and the domain keeps
  // 8,192 bytes of them and answers 200. Nothing about the tail being gone would ever reach the user.
  it('refuses a multi-byte description a character count would have waved through', async () => {
    const { onDescribe } = setup('')
    const emoji = '😀'.repeat(2_049)
    expect(emoji.length).toBeLessThan(MAX_ITEM_DESCRIPTION_BYTES)
    await paste(emoji)
    expect(onDescribe).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('keeps what was written when it refuses, that being the thing still needing shortening', async () => {
    setup('')
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES + 1))
    expect(box().value.length).toBe(MAX_ITEM_DESCRIPTION_BYTES + 1)
  })

  it('sends it once shortened, and clears its own refusal', async () => {
    const { onDescribe } = setup('')
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES + 1))
    await paste('a'.repeat(MAX_ITEM_DESCRIPTION_BYTES))
    expect(onDescribe).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves Enter to the textarea, which is a newline the user meant', async () => {
    const { onDescribe, user } = setup('')
    await user.type(box(), 'one{Enter}two')
    expect(onDescribe).not.toHaveBeenCalled()
    expect(box().value).toBe('one\ntwo')
    await user.tab()
    expect(onDescribe).toHaveBeenCalledWith(PLAN_A, ITEM_1, 'one\ntwo')
  })
})

describe('when the write is refused', () => {
  it('says why, in the API’s own sentence', async () => {
    const { user } = setup('a', () =>
      Promise.resolve({ ok: false, status: 403, detail: 'Not permitted: item:describe' }),
    )
    await user.type(box(), 'b')
    await user.tab()
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: item:describe')
  })

  it('says so when the server never answers, leaving no rejection unhandled', async () => {
    const { user } = setup('a', () => Promise.reject(new TypeError('Failed to fetch')))
    await user.type(box(), 'b')
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })

  it('sends the same text again after a refusal, the write having landed nowhere', async () => {
    const answers: ActionResult<Plan>[] = [{ ok: false, status: 0, detail: 'No answer.' }, served]
    const { onDescribe, user } = setup('a', () => Promise.resolve(answers.shift() ?? served))
    await user.type(box(), 'b')
    await user.tab()
    await user.click(box())
    await user.tab()
    expect(onDescribe).toHaveBeenNthCalledWith(2, PLAN_A, ITEM_1, 'ab')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('takes the next item’s description from a re-render while the box is not focused', () => {
    const { view } = setup('Ship behind a flag')
    view.rerender(
      <DescriptionField
        describe={() => Promise.resolve(served)}
        description="Another item’s note"
        itemId={ITEM_1}
        planId={PLAN_A}
      />,
    )
    expect(box().value).toBe('Another item’s note')
    expect(budget()).toBe('8171 of 8192 bytes left')
    expect('Another item’s note'.length).toBe(19)
  })
})
