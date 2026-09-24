import { NO_ANSWER } from '@repo/app-session/no-answer'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { NameField } from './name-field'

type Rename = (planId: string, subjectId: string, name: string) => Promise<ActionResult<Plan>>

const named = (name: string): StoredAnswer => ({
  ok: true,
  value: atlasPlan({
    features: atlasPlan().features.map((one) => (one.id === FEATURE_1 ? { ...one, name } : one)),
  }),
})

type StoredAnswer = ActionResult<Plan>

const kept: Rename = (_planId, _subjectId, name) => Promise.resolve(named(name))

const field = (name = 'Feature name') => screen.getByRole<HTMLInputElement>('textbox', { name })

const setup = (rename: Rename = kept, name = 'Auth rewrite') => {
  const onRename = vi.fn(rename)
  const view = render(
    <NameField
      kind="feature"
      name={name}
      planId={PLAN_A}
      rename={onRename}
      subjectId={FEATURE_1}
    />,
  )
  return { onRename, view, user: userEvent.setup() }
}

describe('the name a drawer edits', () => {
  it('labels itself “Feature name” on a feature, so the label is not just “Name”', () => {
    setup()
    expect(field().value).toBe('Auth rewrite')
  })

  it('labels itself “Item name” on an item, the drawer drawing one subject at a time', () => {
    render(
      <NameField kind="item" name="Sessions" planId={PLAN_A} rename={kept} subjectId={ITEM_1} />,
    )
    expect(field('Item name').value).toBe('Sessions')
  })

  it('commits on Enter, sending the plan, the subject and the collapsed name', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), '  Auth   rewritten {Enter}')
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onRename).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 'Auth rewritten')
  })

  it('commits on blur too', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Blurred')
    await user.tab()
    expect(onRename).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 'Blurred')
  })

  // The server collapses whitespace and truncates at `LIMITS.nameLength` of its own accord, so the
  // only honest thing to show afterwards is what came back in the plan it answered with.
  it('shows the name the answered plan holds, not the one that was typed', async () => {
    const { user } = setup(() => Promise.resolve(named('What the server kept')))
    await user.clear(field())
    await user.type(field(), 'Typed{Enter}')
    expect(field().value).toBe('What the server kept')
  })

  it('reads that name out of the answered plan by id, not off the first feature it holds', async () => {
    const { user } = setup((_plan, _id, name) => Promise.resolve(named(`${name} (kept)`)))
    await user.clear(field())
    await user.type(field(), 'Second{Enter}')
    expect(field().value).toBe('Second (kept)')
  })

  it('reverts on Escape and sends nothing', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Discarded{Escape}')
    expect(field().value).toBe('Auth rewrite')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('restores silently, with no request, when the field is emptied', async () => {
    const { onRename, user } = setup()
    await user.clear(field())
    await user.type(field(), '   {Enter}')
    expect(field().value).toBe('Auth rewrite')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('sends nothing when the name is unchanged once whitespace is collapsed', async () => {
    const { onRename, user } = setup()
    await user.type(field(), '   {Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })

  it('caps what can be typed at the name length the API accepts', () => {
    setup()
    expect(field().maxLength).toBe(80)
  })

  it('shows the refusal and restores the stored name when the server refuses', async () => {
    const { user } = setup(() =>
      Promise.resolve({ ok: false, status: 403, detail: 'Not permitted: feature:rename' }),
    )
    await user.clear(field())
    await user.type(field(), 'Mine{Enter}')
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:rename')
    expect(field().value).toBe('Auth rewrite')
  })

  it('clears the refusal once a later rename is served', async () => {
    const answers: StoredAnswer[] = [
      { ok: false, status: 409, detail: 'No.' },
      named('Second try'),
    ]
    const { user } = setup(() => Promise.resolve(answers.shift() ?? named('x')))
    await user.clear(field())
    await user.type(field(), 'One{Enter}')
    await user.clear(field())
    await user.type(field(), 'Two{Enter}')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(field().value).toBe('Second try')
  })

  it('says so and restores the name when the server never answers, leaving no rejection unhandled', async () => {
    const { user } = setup(() => Promise.reject(new TypeError('Failed to fetch')))
    await user.clear(field())
    await user.type(field(), 'Mine{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(field().value).toBe('Auth rewrite')
  })

  it('never overwrites the field while the user is typing in it', async () => {
    const { view, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Half-typ')
    view.rerender(
      <NameField
        kind="feature"
        name="Renamed elsewhere"
        planId={PLAN_A}
        rename={kept}
        subjectId={FEATURE_1}
      />,
    )
    expect(field().value).toBe('Half-typ')
  })

  // A drawer makes this case ordinary rather than exotic: moving from one feature's URL to another's
  // is a soft navigation that re-renders this very instance with a different subject's name, and
  // `defaultValue` is read once. Without the effect the field would show the feature just left.
  it('takes the new subject’s name from a re-render while the field is not focused', () => {
    const { view } = setup()
    view.rerender(
      <NameField kind="feature" name="Billing" planId={PLAN_A} rename={kept} subjectId={FEATURE_1} />,
    )
    expect(field().value).toBe('Billing')
  })

  it('does not overwrite what the user started typing while the rename was in flight', async () => {
    let answer: (result: StoredAnswer) => void = () => undefined
    const { user } = setup(() => new Promise((resolve) => (answer = resolve)))
    await user.clear(field())
    await user.type(field(), 'First{Enter}')
    await user.click(field())
    await user.type(field(), ' and more')
    await act(async () => answer(named('First')))
    expect(field().value).toBe('First and more')
  })
})
