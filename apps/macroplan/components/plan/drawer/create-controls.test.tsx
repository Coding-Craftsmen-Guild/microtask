import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { NewFeature, NewItem, Plan } from '@repo/api-client'
import { LIMITS } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, EPIC_1, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import { CreateControls } from './create-controls'
import { NEEDS_A_NAME, NEW_FEATURE_HINT, NEW_ITEM_HINT, type PlanCreate } from './field'

const served: ActionResult<Plan> = { ok: true, value: atlasPlan() }

interface Drawn {
  readonly railId?: string | null
  readonly featureId?: string
  readonly newFeature?: boolean
  readonly newItem?: boolean
  readonly answer?: ActionResult<Plan>
  readonly reject?: boolean
}

const answering = (over: Drawn) => {
  if (over.reject === true) return () => Promise.reject(new TypeError('Failed to fetch'))
  return () => Promise.resolve(over.answer ?? served)
}

const open = (over: Drawn = {}) => {
  const createFeature = vi.fn<PlanCreate<NewFeature>>(answering(over))
  const createItem = vi.fn<PlanCreate<NewItem>>(answering(over))
  render(
    <CreateControls
      createFeature={createFeature}
      createItem={createItem}
      featureId={over.featureId ?? FEATURE_1}
      newFeature={over.newFeature ?? true}
      newItem={over.newItem ?? true}
      planId={PLAN_A}
      railId={over.railId === undefined ? EPIC_1 : over.railId}
    />,
  )
  return { createFeature, createItem, user: userEvent.setup() }
}

const box = (label: string) => screen.getByRole<HTMLInputElement>('textbox', { name: label })

const FEATURE_BOX = 'New feature on this rail'

const ITEM_BOX = 'New item in this feature'

const typeInto = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  typed: string,
) => {
  await user.click(box(label))
  await user.paste(typed)
}

describe('the two things a drawer can add, each under a parent it did not have to be asked for', () => {
  it('adds a feature to this subject’s own rail, carrying the rail and the name and nothing else', async () => {
    const { createFeature, user } = open()
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(createFeature).toHaveBeenCalledWith(PLAN_A, { epicId: EPIC_1, name: 'Sessions rework' })
  })

  it('adds an item to this subject’s own feature, carrying the feature and the name', async () => {
    const { createItem, user } = open()
    await typeInto(user, ITEM_BOX, 'Token rotation')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(createItem).toHaveBeenCalledWith(PLAN_A, { featureId: FEATURE_1, name: 'Token rotation' })
  })

  // `CreateFeaturePayload` accepts a `pinSprint`, and one gate stands in front of the whole body:
  // `createFeature` asks `feature:create` and nothing else, where a pin on a live feature is asked
  // against `feature:pin`, which only `manage` holds. A `write` seat sending a pin here would be pinning
  // a feature it would be refused the pin control for, so this control sends two keys and never four.
  it('sends no pin and no estimate with a new feature, the create route gating on neither', async () => {
    const { createFeature, user } = open()
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    const draft = createFeature.mock.calls[0]?.[1]
    expect(Object.keys(draft ?? {}).sort()).toEqual(['epicId', 'name'])
  })

  it('sends no estimate with a new item either, a size being a separate write and a separate gate', async () => {
    const { createItem, user } = open()
    await typeInto(user, ITEM_BOX, 'Token rotation')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    const draft = createItem.mock.calls[0]?.[1]
    expect(Object.keys(draft ?? {}).sort()).toEqual(['featureId', 'name'])
  })

  it('creates on Enter as well as on the button, the box being one field of one form', async () => {
    const { createFeature, user } = open()
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.keyboard('{Enter}')
    expect(createFeature).toHaveBeenCalledTimes(1)
  })

  it('trims what was typed, an EntityName being trimmed before it is checked for length', async () => {
    const { createFeature, user } = open()
    await typeInto(user, FEATURE_BOX, '  Sessions rework  ')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(createFeature).toHaveBeenCalledWith(PLAN_A, { epicId: EPIC_1, name: 'Sessions rework' })
  })

  it('stops a name at the contract’s own length rather than letting the API shorten it silently', () => {
    open()
    expect(box(FEATURE_BOX).maxLength).toBe(LIMITS.nameLength)
    expect(box(ITEM_BOX).maxLength).toBe(LIMITS.nameLength)
  })

  it('says where each new thing lands, there being no placement to offer (spec §6)', () => {
    open()
    expect(screen.getByText(NEW_FEATURE_HINT)).toBeTruthy()
    expect(screen.getByText(NEW_ITEM_HINT)).toBeTruthy()
  })

  it('draws no placement control of its own, the position being the server’s', () => {
    open()
    expect(screen.queryAllByRole('combobox')).toEqual([])
    expect(screen.queryAllByRole('spinbutton')).toEqual([])
  })

  it('empties the box on success, so the next name is typed into an empty one', async () => {
    const { user } = open()
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(box(FEATURE_BOX).value).toBe('')
  })

  it('keeps the two boxes apart, so a name typed in one is not sent by the other', async () => {
    const { createFeature, createItem, user } = open()
    await typeInto(user, ITEM_BOX, 'Token rotation')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(createFeature).not.toHaveBeenCalled()
    expect(createItem).toHaveBeenCalledTimes(1)
  })
})

describe('an empty box, which is a refusal and not a silent no-op', () => {
  it('sends nothing and says why, a name being the whole of what a create carries', async () => {
    const { createFeature, user } = open()
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(createFeature).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(NEEDS_A_NAME)
  })

  it('refuses whitespace the same way, the trim leaving nothing to send', async () => {
    const { createItem, user } = open()
    await typeInto(user, ITEM_BOX, '   ')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(createItem).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(NEEDS_A_NAME)
  })

  it('clears that refusal once a real name lands', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('what this surface draws, which is a rendering answer and never a gate', () => {
  it('draws the feature box only where createFeature says so', () => {
    open({ newFeature: false })
    expect(screen.queryByRole('textbox', { name: FEATURE_BOX })).toBeNull()
    expect(box(ITEM_BOX)).toBeTruthy()
  })

  it('draws the item box only where createItem says so', () => {
    open({ newItem: false })
    expect(screen.queryByRole('textbox', { name: ITEM_BOX })).toBeNull()
    expect(box(FEATURE_BOX)).toBeTruthy()
  })

  it('draws neither for a surface that may create nothing, leaving the band childless', () => {
    const { container } = render(
      <CreateControls
        createFeature={vi.fn<PlanCreate<NewFeature>>()}
        createItem={vi.fn<PlanCreate<NewItem>>()}
        featureId={FEATURE_1}
        newFeature={false}
        newItem={false}
        planId={PLAN_A}
        railId={EPIC_1}
      />,
    )
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(container.firstElementChild?.childElementCount).toBe(0)
  })

  // `railsOf` gives a feature whose `epicId` names no epic a rail of its own, so the panel is on screen
  // while `FeatureService.add` would answer `assertEpic` with a 404 for that same id. No box is better
  // than one whose every submit fails.
  it('draws no feature box where no epic of the plan claims this rail, the item box surviving', () => {
    open({ railId: null })
    expect(screen.queryByRole('textbox', { name: FEATURE_BOX })).toBeNull()
    expect(box(ITEM_BOX)).toBeTruthy()
  })
})

describe('a create the API refused, and one the server never answered', () => {
  it('says the sentence it came back with and leaves what was typed on screen to be fixed', async () => {
    const { user } = open({ answer: { ok: false, status: 409, detail: 'A plan holds at most 200 features' } })
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(screen.getByRole('alert').textContent).toBe('A plan holds at most 200 features')
    expect(box(FEATURE_BOX).value).toBe('Sessions rework')
  })

  it('says so rather than leaving the rejection unhandled', async () => {
    const { user } = open({ reject: true })
    await typeInto(user, ITEM_BOX, 'Token rotation')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })

  it('names the refused box as its own description, so a reader hears which one it is about', async () => {
    const { user } = open({ answer: { ok: false, status: 403, detail: 'Not permitted: feature:create' } })
    await typeInto(user, FEATURE_BOX, 'Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    const described = box(FEATURE_BOX).getAttribute('aria-describedby') ?? ''
    expect(described.split(' ').map((id) => document.getElementById(id)?.textContent)).toContain(
      'Not permitted: feature:create',
    )
    expect(box(FEATURE_BOX).getAttribute('aria-invalid')).toBe('true')
  })
})
