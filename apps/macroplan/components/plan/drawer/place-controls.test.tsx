import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import { planScreenModel } from '../plan-screen-model'
import type { TableRow } from '../table/rows'
import {
  EPIC_2,
  FEATURE_1,
  FEATURE_2,
  FEATURE_6,
  ITEM_1,
  ITEM_2,
  PLAN_A,
  atlasPlan,
  railedPlan,
} from '../testing/plan-fixture'
import { nothingDrawn, stubActions } from '../testing/plan-writes'
import { PlaceControls } from './place-controls'
import { drawerSubject } from './subject'
import type { DrawerValues } from './values'

const RAILED = planScreenModel(railedPlan())

const ATLAS = planScreenModel(atlasPlan())

const subjectOf = (kind: 'feature' | 'item', id: string, plan = RAILED) => {
  const found = drawerSubject(plan, kind, id)
  if (found === undefined) throw new Error(`the fixture holds no ${kind} ${id}`)
  return found
}

interface Open {
  readonly kind?: 'feature' | 'item'
  readonly id?: string
  readonly plan?: typeof RAILED
  readonly controls?: PlanContentControls
  readonly actions?: PlanEditActions
  readonly values?: DrawerValues
  readonly row?: TableRow
}

const open = (over: Open = {}) => {
  const subject = subjectOf(over.kind ?? 'feature', over.id ?? FEATURE_1, over.plan ?? RAILED)
  const actions = over.actions ?? stubActions()
  render(
    <PlaceControls
      actions={actions}
      controls={over.controls ?? ADMIN_CONTROLS.content}
      planId={PLAN_A}
      row={over.row ?? subject.row}
      values={over.values ?? subject.values}
    />,
  )
  return actions
}

const labels = (): readonly string[] =>
  screen.queryAllByRole('button').map((one) => one.textContent ?? '')

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

const callsOf = (write: unknown): readonly unknown[][] => vi.mocked(write as () => void).mock.calls

afterEach(cleanup)

describe('the group a keyboard reorders a feature with', () => {
  it('draws one step each way and one control per other rail, named by the rail', () => {
    open()
    expect(labels()).toEqual(['Move up', 'Move down', 'Move to Payments', 'Move to Growth'])
  })

  it('names the group by what it does to the subject, so the controls are not loose buttons', () => {
    open()
    expect(screen.getByRole('group', { name: 'Move on its rail' })).toBeTruthy()
  })

  it('disables the step there is nowhere to take, which is how an end of a rail is drawn', () => {
    open()
    expect(screen.getByRole('button', { name: 'Move up' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Move down' }).hasAttribute('disabled')).toBe(false)
  })

  it('counts the sibling no bar was drawn for, so a step down is a step past a hidden feature', () => {
    const actions = open()
    press('Move down')
    expect(callsOf(actions.placeFeature)).toEqual([
      [PLAN_A, FEATURE_1, { epicId: '01MPEEEEEEEEEEEEEEEEEEEEE1', position: 1 }],
    ])
    expect(RAILED.features.find((one) => one.id === FEATURE_2)?.estimateDays).toBeNull()
  })

  it('sends the feature route with an epicId, and never the item route', () => {
    const actions = open()
    press('Move to Payments')
    expect(callsOf(actions.placeFeature)).toEqual([
      [PLAN_A, FEATURE_1, { epicId: EPIC_2, position: 0 }],
    ])
    expect(callsOf(actions.placeItem)).toEqual([])
  })

  it('sends one request and nothing else of the eighteen, whichever control was pressed', () => {
    const actions = open({ id: FEATURE_6 })
    press('Move up')
    const spent = Object.entries(actions)
      .filter(([, write]) => callsOf(write).length > 0)
      .map(([name]) => name)
    expect(spent).toEqual(['placeFeature'])
  })
})

describe('the group a keyboard reorders an item with', () => {
  it('draws the same two steps and one control per other feature of the plan', () => {
    open({ kind: 'item', id: ITEM_1, plan: ATLAS })
    expect(labels()).toEqual(['Move up', 'Move down', 'Move to Billing'])
  })

  it('names its group for the feature the item is in rather than for a rail', () => {
    open({ kind: 'item', id: ITEM_1, plan: ATLAS })
    expect(screen.getByRole('group', { name: 'Move in its feature' })).toBeTruthy()
  })

  it('sends the item route with a featureId, and never the feature route', () => {
    const actions = open({ kind: 'item', id: ITEM_2, plan: ATLAS })
    press('Move to Billing')
    expect(callsOf(actions.placeItem)).toEqual([
      [PLAN_A, ITEM_2, { featureId: '01MPFFFFFFFFFFFFFFFFFFFFF2', position: 1 }],
    ])
    expect(callsOf(actions.placeFeature)).toEqual([])
  })

  it('steps an item within its own feature, counting in the list the far end counts in', () => {
    const actions = open({ kind: 'item', id: ITEM_2, plan: ATLAS })
    press('Move up')
    expect(callsOf(actions.placeItem)).toEqual([
      [PLAN_A, ITEM_2, { featureId: FEATURE_1, position: 0 }],
    ])
  })
})

describe('what is drawn and what is not', () => {
  it('draws nothing at all where this surface may place neither', () => {
    open({ controls: nothingDrawn() })
    expect(labels()).toEqual([])
  })

  it('reads the boolean of the subject’s own kind, so a feature’s answer cannot draw an item’s group', () => {
    open({ controls: { ...ADMIN_CONTROLS.content, placeFeature: false } })
    expect(labels()).toEqual([])
    cleanup()
    open({
      controls: { ...ADMIN_CONTROLS.content, placeFeature: false },
      id: ITEM_1,
      kind: 'item',
      plan: ATLAS,
    })
    expect(labels().length).toBeGreaterThan(0)
  })

  // `railsOf` gives a feature whose `epicId` names no epic a rail of its own, so it has a row and a panel
  // while `assertEpic` would answer 404 for that id. No group is a better answer than controls that all fail.
  it('draws nothing for a feature on a rail the plan does not hold', () => {
    const orphaned = planScreenModel(atlasPlan({ epics: [] }))
    open({ plan: orphaned })
    expect(labels()).toEqual([])
  })

  it('draws the group for an item under such a feature, an item’s parent being the feature', () => {
    const orphaned = planScreenModel(atlasPlan({ epics: [] }))
    open({ id: ITEM_1, kind: 'item', plan: orphaned })
    expect(labels().length).toBeGreaterThan(0)
  })
})

describe('what a refused write says', () => {
  it('says it under the group as an alert, in this app’s words rather than the API’s', async () => {
    const actions = stubActions({
      placeFeature: vi.fn(() =>
        Promise.resolve({ ok: false as const, status: 403, detail: 'Not permitted.' }),
      ),
    })
    open({ actions })
    press('Move down')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('Not permitted.')
  })

  it('says nothing where the write landed, the drawer and the timeline both having re-rendered', async () => {
    const actions = open()
    press('Move down')
    await vi.waitFor(() => {
      expect(callsOf(actions.placeFeature)).toHaveLength(1)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
