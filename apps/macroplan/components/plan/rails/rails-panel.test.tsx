import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EPIC_1, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { NEW_RAIL_WORDS } from './new-rail-form'
import { RAIL_FEATURE_WORDS } from './rail-feature'
import { railRows } from './rail-rows'
import { RAILS_WORDS, RailsPanel } from './rails-panel'

const answered = { ok: true, value: atlasPlan() } as const

const rows = railRows(planScreenModel(atlasPlan()))

const setup = (over: Partial<Parameters<typeof RailsPanel>[0]> = {}) => {
  const create = vi.fn().mockResolvedValue(answered)
  const createFeature = vi.fn().mockResolvedValue(answered)
  render(
    <RailsPanel
      create={create}
      createFeature={createFeature}
      mayAddFeature
      mayRecolour
      mayRemove
      mayRename
      mayReorder
      planId={PLAN_A}
      recolour={vi.fn()}
      remove={vi.fn()}
      rename={vi.fn()}
      reorder={vi.fn()}
      rows={rows}
      {...over}
    />,
  )
  return { create, createFeature, user: userEvent.setup() }
}

describe('RailsPanel', () => {
  it('counts the rails in the summary, so a plan with none reads as an invitation', () => {
    setup({ rows: [] })
    expect(screen.getByText(`${RAILS_WORDS.edit} (0)`)).toBeTruthy()
    expect(screen.getByText(RAILS_WORDS.none)).toBeTruthy()
  })

  it('counts them when there are some, and says nothing about an empty plan', () => {
    setup()
    expect(screen.getByText(`${RAILS_WORDS.edit} (1)`)).toBeTruthy()
    expect(screen.queryByText(RAILS_WORDS.none)).toBeNull()
  })

  it('adds a rail by name and nothing else, the hue and the lane being the server’s', async () => {
    const { create, user } = setup()
    await user.type(screen.getByLabelText(NEW_RAIL_WORDS.label), 'Billing')
    await user.click(screen.getByRole('button', { name: NEW_RAIL_WORDS.action }))
    expect(create).toHaveBeenCalledExactlyOnceWith(PLAN_A, { name: 'Billing' })
  })

  it('adds a feature to the rail its own row names, which is the way into a new plan', async () => {
    const { createFeature, user } = setup()
    await user.type(screen.getByLabelText('Name of a new feature on Platform'), 'Checkout')
    await user.click(screen.getByRole('button', { name: RAIL_FEATURE_WORDS.action }))
    expect(createFeature).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      epicId: EPIC_1,
      name: 'Checkout',
    })
  })

  it('offers no feature box to a reader who may not create one, the rail row still editable', () => {
    setup({ mayAddFeature: false })
    expect(screen.queryByLabelText('Name of a new feature on Platform')).toBeNull()
    expect(screen.getByLabelText('Name of Platform')).toBeTruthy()
  })

  it('still offers the add-rail box for a plan with no rails, that being the only way out of empty', () => {
    setup({ rows: [] })
    expect(screen.getByLabelText(NEW_RAIL_WORDS.label)).toBeTruthy()
  })
})
