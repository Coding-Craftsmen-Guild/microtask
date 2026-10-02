import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlanBoard } from './plan-board'
import { planScreenModel } from '../plan-screen-model'
import { railedPlan, PLAN_A } from '../testing/plan-fixture'
import { ADMIN_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { planAxis } from '../canvas/zoom-view'
import { BOARD_WORDS } from './board-words'

const AT = new Date('2026-09-28T09:00:00.000Z')

const NO_WRITES = {
  createFeature: null,
  createItem: null,
  labelFeature: null,
  placeFeature: null,
  placeItem: null,
  setDependencies: null,
}

const board = () => {
  const plan = planScreenModel(railedPlan())
  const axis = planAxis(plan, AT, 'item')
  render(
    <PlanBoard
      at={AT}
      draw={NO_WRITES}
      mayReorder={false}
      place={null}
    size={{ estimateFeature: null, estimateItem: null }}
      plan={plan}
      progress={[]}
      range={axis.range}
      root={PLAN_A}
      routes={ADMIN_DRAWER_ROUTES}
      rung="item"
      scale={axis.scale}
    />,
  )
  return userEvent.setup()
}

const faded = (slot: string): readonly string[] =>
  [...document.querySelectorAll(`[data-slot="${slot}"]`)]
    .filter((node) => node.hasAttribute('data-faded'))
    .map((node) => node.getAttribute('data-search') ?? '')

const lit = (slot: string): readonly string[] =>
  [...document.querySelectorAll(`[data-slot="${slot}"]`)]
    .filter((node) => !node.hasAttribute('data-faded'))
    .map((node) => node.getAttribute('data-search') ?? '')

// The filter dims rather than hides, which the board's own geometry forces: the canvas is laid out on
// the server, so a hidden lane would leave a lane-shaped hole and a hidden bar a gap in a run of them.
describe('the one box that narrows both halves of the board', () => {
  it('dims nothing at all until something is typed', async () => {
    board()

    expect(faded('rail-row')).toEqual([])
    expect(faded('feature-group')).toEqual([])
  })

  it('lights the rails whose names match and dims the rest', async () => {
    const user = await board()
    await user.type(screen.getByRole('searchbox', { name: BOARD_WORDS.filter }), 'payments')

    expect(lit('rail-row')).toEqual(['payments'])
    expect(faded('rail-row').length).toBeGreaterThan(0)
  })

  // The bug this is here for: a feature's key used to be its own name alone, so typing a rail's name
  // lit that rail's row in the column and dimmed every bar on it — which reads as "nothing here
  // matches" about the one rail that did.
  it('keeps the work on a matching rail lit, the rail being part of what a feature is found by', async () => {
    const user = await board()
    await user.type(screen.getByRole('searchbox', { name: BOARD_WORDS.filter }), 'payments')

    expect(lit('feature-group').length).toBeGreaterThan(0)
    for (const search of lit('feature-group')) expect(search).toContain('payments')
  })

  it('lights one feature by its own name, and no other work on its rail', async () => {
    const user = await board()
    await user.type(screen.getByRole('searchbox', { name: BOARD_WORDS.filter }), 'checkout')

    expect(lit('feature-group')).toEqual(['checkout payments'])
  })

  it('dims everything for a word the plan does not hold, rather than nothing', async () => {
    const user = await board()
    await user.type(screen.getByRole('searchbox', { name: BOARD_WORDS.filter }), 'zzz')

    expect(lit('rail-row')).toEqual([])
    expect(lit('feature-group')).toEqual([])
  })

  it('lights everything again when the box is cleared', async () => {
    const user = await board()
    const box = screen.getByRole('searchbox', { name: BOARD_WORDS.filter })
    await user.type(box, 'zzz')
    await user.clear(box)

    expect(faded('rail-row')).toEqual([])
    expect(faded('feature-group')).toEqual([])
  })
})
