import { describe, expect, it } from 'vitest'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import { nothingDrawn, stubActions } from '../testing/plan-writes'
import { placementFor, stepsFor } from './placement'
import type { PlaceTarget } from './values'

const A = 'feature-a'

const B = 'feature-b'

const C = 'feature-c'

const RAIL = 'epic-1'

const OTHER: readonly PlaceTarget[] = [
  { id: 'epic-2', name: 'Payments' },
  { id: 'epic-3', name: 'Growth' },
]

const labels = (siblingIds: readonly string[], id: string, targets = OTHER) =>
  stepsFor(siblingIds, id, RAIL, targets).map((step) => `${step.label}${step.disabled ? ' (off)' : ''}`)

const stepAt = (id: string, key: string) => {
  const found = stepsFor([A, B, C], id, RAIL, OTHER).find((step) => step.key === key)
  if (found === undefined) throw new Error(`no step ${key}`)
  return found
}

describe('which write places a subject of each kind', () => {
  it('reads the feature’s own boolean for a feature and the item’s for an item', () => {
    const actions = stubActions()
    expect(placementFor('feature', ADMIN_CONTROLS.content, actions).placeable).toBe(true)
    expect(placementFor('item', ADMIN_CONTROLS.content, actions).placeable).toBe(true)
    expect(placementFor('feature', nothingDrawn(), actions).placeable).toBe(false)
    expect(placementFor('item', nothingDrawn(), actions).placeable).toBe(false)
  })

  it('reads the boolean of the kind it was asked about and never the other’s', () => {
    const actions = stubActions()
    const drawn = { ...ADMIN_CONTROLS.content, placeFeature: false }
    expect(placementFor('feature', drawn, actions).placeable).toBe(false)
    expect(placementFor('item', drawn, actions).placeable).toBe(true)
  })

  // Both writes come back because the payloads differ and no closure can cross this boundary — the same
  // shape `create-controls.tsx` is handed two creates in, argued in `./placement.ts`.
  it('hands over both place actions and no other plan write', () => {
    const actions = stubActions()
    const placement = placementFor('feature', ADMIN_CONTROLS.content, actions)
    expect(placement.placeFeature).toBe(actions.placeFeature)
    expect(placement.placeItem).toBe(actions.placeItem)
    expect(Object.keys(placement).sort()).toEqual(['placeFeature', 'placeItem', 'placeable'])
  })
})

describe('the steps a keyboard is offered', () => {
  it('offers one step each way and one per other parent, in reading order', () => {
    expect(labels([A, B, C], B)).toEqual([
      'Move up',
      'Move down',
      'Move to Payments',
      'Move to Growth',
    ])
  })

  it('disables the step there is nowhere to take, at each end of the list', () => {
    expect(labels([A, B, C], A).slice(0, 2)).toEqual(['Move up (off)', 'Move down'])
    expect(labels([A, B, C], C).slice(0, 2)).toEqual(['Move up', 'Move down (off)'])
  })

  it('disables both for the only sibling there is, nothing being anywhere relative to nothing', () => {
    expect(labels([A], A).slice(0, 2)).toEqual(['Move up (off)', 'Move down (off)'])
  })

  // The number is an index in the list with the subject lifted out, which is what `placeAmong` reads:
  // one step down is `from + 1` because lifting the subject out has already shifted everything after it.
  it('sends the index the far end counts in: one less going up, one more going down', () => {
    expect(stepAt(B, 'up').position).toBe(0)
    expect(stepAt(B, 'down').position).toBe(2)
    expect(stepAt(A, 'down').position).toBe(1)
    expect(stepAt(C, 'up').position).toBe(1)
  })

  it('carries the subject’s own place on a step that has nowhere to go, there being no “nowhere”', () => {
    expect(stepAt(A, 'up').position).toBe(0)
    expect(stepAt(C, 'down').position).toBe(2)
  })

  it('keeps the subject’s own parent on both steps, a step along a rail changing no rail', () => {
    expect(stepAt(B, 'up').parentId).toBe(RAIL)
    expect(stepAt(B, 'down').parentId).toBe(RAIL)
  })

  // §6 has a drag "move a feature to another rail", and it is the same write with a different parent. The
  // place it keeps is its own, clamped by `placeAmong` where the rail it lands on is shorter.
  it('sends each other parent with the place the subject already has, and never a count', () => {
    expect(stepAt(B, 'epic-2')).toEqual({
      key: 'epic-2',
      label: 'Move to Payments',
      parentId: 'epic-2',
      position: 1,
      disabled: false,
    })
  })

  it('offers no move where the plan has no other parent, rather than a control that means nothing', () => {
    expect(labels([A, B], A, [])).toEqual(['Move up (off)', 'Move down'])
  })

  it('offers nothing at all for a subject the list does not hold, which is a corrupt order and not a step', () => {
    expect(stepsFor([A, B], 'feature-gone', RAIL, OTHER)).toEqual([])
  })

  it('carries five primitives per step and nothing a client component may not hold', () => {
    for (const step of stepsFor([A, B, C], B, RAIL, OTHER)) {
      expect(Object.keys(step).sort()).toEqual([
        'disabled',
        'key',
        'label',
        'parentId',
        'position',
      ])
      for (const value of Object.values(step)) {
        expect(['string', 'number', 'boolean']).toContain(typeof value)
      }
    }
  })
})
