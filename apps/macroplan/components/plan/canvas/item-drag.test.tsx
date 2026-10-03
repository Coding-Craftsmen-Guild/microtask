import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanEditActions } from '../edit-actions'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_2, ITEM_3 } from '../testing/plan-fixture'
import { stubActions } from '../testing/plan-writes'
import { PlanCanvas } from './plan-canvas'
import { LAYOUT } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

const MODEL = planScreenModel(atlasPlan())

// The fixture is one rail with two features on it: FEATURE_2 opens on day five, so this is far enough
// right to put the pointer inside it and so to land an item of FEATURE_1 under it.
const INTO_FEATURE_2 = 90

const shown = (actions: PlanEditActions, over: { readonly mayPlace?: boolean } = {}) =>
  render(
    <PlanCanvas
      at={AT}
      place={actions.placeFeature}
      placeItem={over.mayPlace === false ? null : actions.placeItem}
      plan={MODEL}
      rung="item"
    />,
  )

const at = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const markFor = (id: string): Element => at(`[data-slot="item-mark"][data-item-id="${id}"]`)

// A whole gesture, as a browser sends one: the click after the release is what the frame cancels, and a
// helper stopping at `pointerup` would leave it believing a drag is still unaccounted for.
const drag = (id: string, dx: number, dy: number): void => {
  const root = at('[data-slot="drag-root"]')
  fireEvent.pointerDown(markFor(id), { clientX: 400, clientY: 300 })
  fireEvent.pointerMove(root, { clientX: 400 + dx, clientY: 300 + dy })
  fireEvent.pointerUp(root, { clientX: 400 + dx, clientY: 300 + dy })
  fireEvent.click(markFor(id))
}

const placements = (actions: PlanEditActions): readonly unknown[][] =>
  vi.mocked(actions.placeItem).mock.calls

afterEach(cleanup)

// An item could be moved nowhere before this: the only way to put a sub-task under a different feature
// was to delete it and type it again, though `placeItem` has always existed and the drawer's own ordering
// controls already spend it.
describe('dragging an item to another feature', () => {
  it('sends it to the feature it was dropped on, at the place among that feature’s items', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, INTO_FEATURE_2, 0)
    const [call] = placements(actions)

    expect(call?.[1]).toBe(ITEM_1)
    expect(call?.[2]).toMatchObject({ featureId: expect.any(String), position: expect.any(Number) })
    expect((call?.[2] as { featureId: string }).featureId).not.toBe(FEATURE_1)
  })

  it('writes nothing for a drop that lands back where the item already is', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, 0, 0)

    expect(placements(actions)).toEqual([])
  })

  // Not clamped to the nearest feature: a release in the space between two of them, or below the last
  // rail, names no feature and so writes nothing — the rule §6 states for every drop on this board.
  it('writes nothing for a drop past the last rail, rather than landing on the bottom one', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, 0, LAYOUT.railHeight * 40)

    expect(placements(actions)).toEqual([])
  })

  it('leaves every other write alone, one drop being one request', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, INTO_FEATURE_2, 0)
    const touched = Object.entries(actions)
      .filter(([name]) => name !== 'placeItem')
      .filter(([, write]) => vi.mocked(write).mock.calls.length > 0)
      .map(([name]) => name)

    expect(touched).toEqual([])
  })

  it('writes nothing at all on a surface that may not place an item', () => {
    const actions = stubActions()
    shown(actions, { mayPlace: false })
    drag(ITEM_1, INTO_FEATURE_2, 0)

    expect(placements(actions)).toEqual([])
  })

  // The gesture is the feature drag's neighbour and they share one pointer. An item mark sits inside its
  // feature's rail, so a grab that began on an item must not also start the bar moving.
  it('does not move the feature the item was grabbed inside', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, INTO_FEATURE_2, 0)

    expect(vi.mocked(actions.placeFeature).mock.calls).toEqual([])
  })

  it('draws a ghost of the item while it is being dragged, and none before', () => {
    const actions = stubActions()
    shown(actions)
    expect(document.querySelector('[data-slot="item-ghost"]')).toBeNull()
    fireEvent.pointerDown(markFor(ITEM_2), { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(at('[data-slot="drag-root"]'), { clientX: 420, clientY: 300 })

    expect(document.querySelector('[data-slot="item-ghost"]')).not.toBeNull()
  })

  it('marks the ghost refused where the drop would write nothing', () => {
    const actions = stubActions()
    shown(actions)
    fireEvent.pointerDown(markFor(ITEM_3), { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(at('[data-slot="drag-root"]'), { clientX: 400, clientY: 300 + LAYOUT.railHeight * 40 })

    expect(at('[data-slot="item-ghost"] rect').getAttribute('data-refused')).toBe('true')
  })

  it('says it moved, and offers one step back', async () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, INTO_FEATURE_2, 0)
    await act(async () => {})

    expect(at('[data-slot="drag-root"] [role="status"]').textContent).toContain('Moved')
    expect(document.querySelector('[role="status"] button')?.textContent).toBe('Undo')
  })

  it('states on the frame whether an item may be dragged at all, the handlers being invisible', () => {
    const actions = stubActions()
    shown(actions, { mayPlace: false })

    expect(at('[data-slot="drag-root"]').getAttribute('data-item-drag')).toBe('false')
  })
})

// FEATURE_2's items are untouched by a drag of FEATURE_1's: this is the property that a drop writes one
// request for one item and nothing is renumbered on the client.
describe('what an item drag leaves alone', () => {
  it('names only the item that was dragged', () => {
    const actions = stubActions()
    shown(actions)
    drag(ITEM_1, INTO_FEATURE_2, 0)

    for (const call of placements(actions)) expect(call[1]).toBe(ITEM_1)
  })

  it('still lets a feature be dragged, the two gestures sharing one pointer', () => {
    const actions = stubActions()
    shown(actions)
    const bar = at(`[data-slot="feature-bar"][data-feature-id="${FEATURE_2}"]`)
    const root = at('[data-slot="drag-root"]')
    fireEvent.pointerDown(bar, { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(root, { clientX: 400, clientY: 300 + LAYOUT.railHeight })
    fireEvent.pointerUp(root, { clientX: 400, clientY: 300 + LAYOUT.railHeight })

    expect(placements(actions)).toEqual([])
  })
})
