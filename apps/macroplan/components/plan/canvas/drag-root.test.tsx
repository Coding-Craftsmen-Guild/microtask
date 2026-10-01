import { dropTargetFor, railLayout } from '@repo/canvas'
import type { DropTarget, RailBox } from '@repo/canvas'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanEditActions } from '../edit-actions'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import {
  EPIC_1,
  EPIC_2,
  EPIC_UNCLAIMED,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_5,
  FEATURE_6,
  PLAN_A,
  railedPlan,
} from '../testing/plan-fixture'
import { stubActions } from '../testing/plan-writes'
import { PlanCanvas } from './plan-canvas'
import { CANVAS_SCALE, LAYOUT, railTop } from './view'

const AT = new Date('2026-10-05T09:00:00.000Z')

const MODEL: PlanScreenModel = planScreenModel(railedPlan())

const HALF = LAYOUT.railHeight / 2

const DAY = CANVAS_SCALE.pxPerDay

const RAILS: readonly RailBox[] = railLayout(MODEL, MODEL.schedule, CANVAS_SCALE)

const only = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const barFor = (id: string): Element => only(`[data-slot="feature-bar"][data-feature-id="${id}"]`)

const indexOf = (epicId: string): number => RAILS.findIndex((rail) => rail.epicId === epicId)

const railOf = (id: string): RailBox => {
  const found = RAILS.find((rail) => rail.featureIds.includes(id))
  if (found === undefined) throw new Error(`no rail carries ${id}`)
  return found
}

// The contract `DragPoint` states, written out here as the specification rather than imported from the
// module under test: `x` is the dragged bar's own left edge plus the travel, and `y` is the top of the
// band the drag began in plus the travel plus half a band. What `dropTargetFor` answers for that point is
// what the canvas must send, and nothing else.
const wouldSend = (id: string, dx: number, dy: number): DropTarget | null => {
  const rail = railOf(id)
  const own = rail.bars.find((bar) => bar.id === id)
  const x = (own?.x ?? Number(barFor(id).getAttribute('x'))) + dx
  return dropTargetFor({
    point: { x, y: railTop(indexOf(rail.epicId)) + dy + HALF },
    featureId: id,
    rails: RAILS,
    scale: CANVAS_SCALE,
    metrics: LAYOUT,
  })
}

const identity = (plan: PlanScreenModel): readonly string[] => [
  ...plan.features.map(
    (one) => `${one.id} ${one.epicId} ${String(one.position)} ${String(one.pinSprint)}`,
  ),
  ...plan.epics.map((one) => `${one.id} ${String(one.railOrder)}`),
]

const shown = (actions: PlanEditActions) =>
  render(<PlanCanvas at={AT} place={actions.placeFeature} plan={MODEL} rung="item" />)

// A whole gesture, including the `click` a browser synthesises after the release. That last event is not
// decoration: a bar is now a link to its drawer as well as a drag handle, so the frame cancels the click a
// gesture that actually moved leaves behind — and cancelling it is also what clears the frame's "that was a
// drag" flag. A helper stopping at `pointerup` would leave the frame in a state no browser can be in, with
// a drag believed to be still unaccounted for, and the next click anywhere inside it — the notice's own Undo
// button included — swallowed by the cancel meant for the bar.
const drag = (id: string, dx: number, dy: number): void => {
  const root = only('[data-slot="drag-root"]')
  fireEvent.pointerDown(barFor(id), { clientX: 400, clientY: 300 })
  fireEvent.pointerMove(root, { clientX: 400 + dx, clientY: 300 + dy })
  fireEvent.pointerUp(root, { clientX: 400 + dx, clientY: 300 + dy })
  fireEvent.click(barFor(id))
}

const callsOf = (actions: PlanEditActions): readonly unknown[][] =>
  vi.mocked(actions.placeFeature).mock.calls

const otherWrites = (actions: PlanEditActions): readonly string[] =>
  Object.entries(actions)
    .filter(([name]) => name !== 'placeFeature')
    .filter(([, write]) => vi.mocked(write).mock.calls.length > 0)
    .map(([name]) => name)

afterEach(cleanup)

describe('the frame the canvas is wrapped in', () => {
  it('wraps the server-rendered svg rather than replacing it, and adds nothing inside it', () => {
    const actions = stubActions()
    shown(actions)
    const root = only('[data-slot="drag-root"]')
    expect(root.querySelector('[data-slot="plan-canvas"]')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(document.querySelectorAll('[data-slot="rail"]')).toHaveLength(RAILS.length)
  })

  it('says whether it listens at all, which is the only thing about a handler a test can read', () => {
    const actions = stubActions()
    shown(actions)
    expect(only('[data-slot="drag-root"]').getAttribute('data-drag')).toBe('true')
    cleanup()
    render(<PlanCanvas at={AT} place={null} plan={MODEL} rung="item" />)
    expect(only('[data-slot="drag-root"]').getAttribute('data-drag')).toBe('false')
  })

  it('sends nothing at all on a surface that may not place, however the pointer is driven', () => {
    render(<PlanCanvas at={AT} place={null} plan={MODEL} rung="item" />)
    drag(FEATURE_3, 6 * DAY, 0)
    expect(document.querySelector('[data-slot="drag-ghost"]')).toBeNull()
  })
})

// §9 gates this phase on "a test asserts nothing auto-moves", and §8 records auto-scheduling and a
// constraint solver as rejected: "Validation only. Dates are derived, never repaired." §6 names a solver
// that silently moves an executive's committed plan as a worse failure than a visible contradiction. This
// is the canvas's half of that, stated as a property over every bar and a spread of drops.
//
// What an app test can and cannot assert about it is worth saying plainly. It asserts that **one** feature
// is named by **one** request, that the placement in it is the one `dropTargetFor` answers for the point
// the drag reached, that no other plan write is sent, and that nothing in the plan this surface
// holds is rewritten locally — spans are derived on read and never stored (§3.4), so the surface has no
// copy of the geometry to repair and no code here to repair it with. What the **store** then does with that
// one request is `apps/api`'s to assert and is asserted there:
// `packages/macroplan-domain/src/services/cascade.test.ts` holds "nothing auto-moves when a feature is
// deleted from the middle of a rail" against a whole manifest, and `placeAmong` renumbers only the rail it
// was asked about. A fake in this app could not add to that: `testing/recording-admin.ts` says why — "it is
// not a store, so no test here may assert that a write was applied", and a fake that applied one would be a
// second implementation of the forward pass.
describe('nothing auto-moves', () => {
  it('sends one placement for the one bar dragged, and nothing for any other feature', () => {
    const travels: readonly (readonly [number, number])[] = [
      [0, 0],
      [1, 0],
      [3 * DAY, 0],
      [-3 * DAY, 0],
      [6 * DAY, 0],
      [0, LAYOUT.railHeight],
      [2 * DAY, -LAYOUT.railHeight],
    ]
    const before = identity(MODEL)
    for (const rail of RAILS) {
      for (const bar of rail.bars) {
        for (const [dx, dy] of travels) {
          const actions = stubActions()
          shown(actions)
          drag(bar.id, dx, dy)
          const where = `${bar.id} by ${String(dx)},${String(dy)}`
          const expected = wouldSend(bar.id, dx, dy)
          const own = wouldSend(bar.id, 0, 0)
          const sends = expected !== null && JSON.stringify(expected) !== JSON.stringify(own)
          expect(callsOf(actions), where).toEqual(
            sends ? [[PLAN_A, bar.id, expected]] : [],
          )
          expect(otherWrites(actions), where).toEqual([])
          expect(identity(MODEL), where).toEqual(before)
          cleanup()
        }
      }
    }
  })

  it('names in that request no feature but the one dragged, so nothing else can have been moved', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    expect(callsOf(actions)).toHaveLength(1)
    const sent = JSON.stringify(callsOf(actions)[0])
    for (const other of [FEATURE_1, FEATURE_2, FEATURE_6, FEATURE_5]) {
      expect(sent.includes(other), other).toBe(false)
    }
  })
})

// The oracle is the answer `dropTargetFor` gives for the bar's **own** x, and not `feature.position`: the
// two differ on any rail carrying a feature the forward pass could not place, which is the first rail of
// this fixture. `settledAt` asks the one function twice, once with the travel and once without, and sends
// nothing when the two agree.
describe('a bar put back where it started', () => {
  it('sends no request at all, for every bar on every claimed rail', () => {
    for (const rail of RAILS) {
      for (const bar of rail.bars) {
        const actions = stubActions()
        shown(actions)
        drag(bar.id, 0, 0)
        expect(callsOf(actions), bar.id).toEqual([])
        cleanup()
      }
    }
  })

  it('sends nothing for a nudge that stays inside the gap the bar was already in', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_1, 1, 1)
    expect(callsOf(actions)).toEqual([])
  })

  it('sends nothing for the bar on the rail storing a sibling that got no bar, which is the trap', () => {
    const rail = railOf(FEATURE_1)
    expect(rail.featureIds).toEqual([FEATURE_1, FEATURE_2])
    expect(rail.bars).toHaveLength(1)
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_1, 0, 0)
    expect(callsOf(actions)).toEqual([])
  })

  it('does send once the drag really has crossed a sibling, so the no-op is not a mute', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    expect(callsOf(actions)).toEqual([[PLAN_A, FEATURE_3, { epicId: EPIC_2, position: 1 }]])
  })
})

// The gutter this rail's unsized sibling used to be stubbed into is gone, and so is the stub: the rail names
// left the SVG for an HTML column, `CANVAS_SCALE.gutter` is 0, and a feature the forward pass could not place
// now gets no mark on the canvas at all — it is a row in the tray under the board (`../attention/`), where it
// can be sized rather than dragged into an order it has no dates for. What survives that deletion is the
// thing the drag actually depends on: such a feature is still stored on its rail, so it still holds a place
// in the order a drop is answered in, which is why "the trap" above is not the same number as a bar count.
describe('a feature the forward pass could not place', () => {
  it('is drawn nowhere on the canvas, so no gesture over the board can reach it', () => {
    const actions = stubActions()
    shown(actions)
    expect(document.querySelector(`[data-feature-id="${FEATURE_2}"]`)).toBeNull()
    expect(railOf(FEATURE_2).featureIds).toContain(FEATURE_2)
    expect(railOf(FEATURE_2).bars.map((bar) => bar.id)).not.toContain(FEATURE_2)
  })

  it('cannot be grabbed off the band that stores it, a press on no bar being no grab', () => {
    const actions = stubActions()
    shown(actions)
    const root = only('[data-slot="drag-root"]')
    fireEvent.pointerDown(only(`[data-slot="rail"][data-epic-id="${EPIC_1}"]`), {
      clientX: 400,
      clientY: 300,
    })
    expect(document.querySelector('[data-slot="drag-ghost"]')).toBeNull()
    fireEvent.pointerMove(root, { clientX: 400 + 6 * DAY, clientY: 300 })
    fireEvent.pointerUp(root, { clientX: 400 + 6 * DAY, clientY: 300 })
    expect(callsOf(actions)).toEqual([])
  })
})

describe('a drop that names no placement', () => {
  it('sends nothing for a drag left off the axis, there being no day before day zero', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, -4 * DAY, 0)
    expect(callsOf(actions)).toEqual([])
  })

  it('sends nothing for a drag up off the top of the board, there being no rail above the first', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 0, -LAYOUT.railHeight * 4)
    expect(callsOf(actions)).toEqual([])
  })

  // One band of travel up from the **first** rail leaves the drawing, which it did not when a chrome band
  // held the quarter and week headings: `LAYOUT.chromeHeight` is 0 now that those are an HTML row above the
  // canvas, so the first rail is flush with the top of the SVG and there is nothing above it to land on.
  it('sends nothing for one band of travel up off the first rail, which now starts at y zero', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_1, 0, -LAYOUT.railHeight)
    expect(callsOf(actions)).toEqual([])
  })

  it('sends nothing for a drag onto the rail no epic claims, there being no placement there', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_1, 0, railTop(indexOf(EPIC_UNCLAIMED)) - railTop(indexOf(EPIC_1)))
    expect(callsOf(actions)).toEqual([])
  })

  it('sends nothing for a bar on that rail dropped back where it was, since it names none either', () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_5, 2 * DAY, 0)
    expect(callsOf(actions)).toEqual([])
  })
})

describe('the ghost that follows the pointer', () => {
  it('is drawn only while a pointer is down, in the canvas’s own box', () => {
    const actions = stubActions()
    shown(actions)
    expect(document.querySelector('[data-slot="drag-ghost"]')).toBeNull()
    fireEvent.pointerDown(barFor(FEATURE_3), { clientX: 400, clientY: 300 })
    const ghost = only('[data-slot="drag-ghost"]')
    const canvas = only('[data-slot="plan-canvas"]')
    expect(ghost.getAttribute('viewBox')).toBe(canvas.getAttribute('viewBox'))
    expect(ghost.getAttribute('height')).toBe(canvas.getAttribute('height'))
    fireEvent.pointerUp(only('[data-slot="drag-root"]'), { clientX: 400, clientY: 300 })
    expect(document.querySelector('[data-slot="drag-ghost"]')).toBeNull()
  })

  it('sits where the dragged bar has got to, which is its own x and y plus the travel', () => {
    const actions = stubActions()
    shown(actions)
    const bar = barFor(FEATURE_3)
    fireEvent.pointerDown(bar, { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(only('[data-slot="drag-root"]'), { clientX: 400 + 3 * DAY, clientY: 290 })
    const rect = only('[data-slot="drag-ghost"] rect')
    // Against `data-x`, not the drawn `x`: a bar's edge is pulled in by a pixel so a run of them does
    // not paint as one block, and the drag is answered against the true geometry — a ghost measured
    // from the drawn edge would sit a pixel off the bar it is standing in for.
    expect(Number(rect.getAttribute('x'))).toBe(Number(bar.getAttribute('data-x')) + 3 * DAY)
    expect(Number(rect.getAttribute('y'))).toBe(Number(bar.getAttribute('data-y')) - 10)
    expect(Number(rect.getAttribute('width'))).toBe(Number(bar.getAttribute('data-width')))
  })

  it('says so when the point under it names no placement, rather than showing a move that will not happen', () => {
    const actions = stubActions()
    shown(actions)
    fireEvent.pointerDown(barFor(FEATURE_3), { clientX: 400, clientY: 300 })
    expect(only('[data-slot="drag-ghost"] rect').getAttribute('data-refused')).toBe('false')
    fireEvent.pointerMove(only('[data-slot="drag-root"]'), { clientX: 400, clientY: 100 })
    expect(only('[data-slot="drag-ghost"] rect').getAttribute('data-refused')).toBe('true')
  })

  it('is hidden from a reader, the reorder a reader has being the drawer’s own controls', () => {
    const actions = stubActions()
    shown(actions)
    fireEvent.pointerDown(barFor(FEATURE_3), { clientX: 400, clientY: 300 })
    expect(only('[data-slot="drag-ghost"]').getAttribute('aria-hidden')).toBe('true')
  })

  it('is forgotten when the pointer leaves the frame, which cancels rather than guessing', () => {
    const actions = stubActions()
    shown(actions)
    const root = only('[data-slot="drag-root"]')
    fireEvent.pointerDown(barFor(FEATURE_3), { clientX: 400, clientY: 300 })
    fireEvent.pointerLeave(root)
    expect(document.querySelector('[data-slot="drag-ghost"]')).toBeNull()
    fireEvent.pointerUp(root, { clientX: 400 + 6 * DAY, clientY: 300 })
    expect(callsOf(actions)).toEqual([])
  })
})

// A bar is a link to its drawer as well as a drag handle, which is the one thing a press on it has to
// disambiguate: the browser fires a `click` after every pointer gesture, so a bar dropped two rails down
// would also navigate away from the plan it was just dropped on. The frame decides it on travel — under a
// few pixels the gesture was a click and the link is left alone, over it the click is cancelled — and
// `dispatchEvent` answering `false` is how a test reads a cancelled default.
describe('the click a gesture leaves behind', () => {
  it('is cancelled after a drag that moved, so a dropped bar does not also open its drawer', () => {
    const actions = stubActions()
    shown(actions)
    const root = only('[data-slot="drag-root"]')
    const bar = barFor(FEATURE_3)
    fireEvent.pointerDown(bar, { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(root, { clientX: 400 + 6 * DAY, clientY: 300 })
    fireEvent.pointerUp(root, { clientX: 400 + 6 * DAY, clientY: 300 })
    expect(fireEvent.click(bar)).toBe(false)
  })

  it('is left alone after a press that barely moved, a bar still being the way into its drawer', () => {
    const actions = stubActions()
    shown(actions)
    const root = only('[data-slot="drag-root"]')
    const bar = barFor(FEATURE_3)
    fireEvent.pointerDown(bar, { clientX: 400, clientY: 300 })
    fireEvent.pointerMove(root, { clientX: 402, clientY: 300 })
    fireEvent.pointerUp(root, { clientX: 402, clientY: 300 })
    expect(fireEvent.click(bar)).toBe(true)
    expect(callsOf(actions)).toEqual([])
  })
})

describe('the undo a drop offers', () => {
  it('says what happened and offers to put it back', async () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('sends the placement the feature held before the drop, read off the layout the drop used', async () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await screen.findByRole('status')
    expect(callsOf(actions)).toEqual([
      [PLAN_A, FEATURE_3, { epicId: EPIC_2, position: 1 }],
      [PLAN_A, FEATURE_3, { epicId: EPIC_2, position: 0 }],
    ])
  })

  it('offers no undo of the undo, one step being the whole promise', async () => {
    const actions = stubActions()
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    })
  })

  it('offers none when the write was refused, there being nothing to take back', async () => {
    const actions = stubActions({
      placeFeature: vi.fn(() => Promise.resolve({ ok: false as const, status: 403, detail: 'Not permitted.' })),
    })
    shown(actions)
    drag(FEATURE_3, 6 * DAY, 0)
    expect(await screen.findByText('Not permitted.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})

// Measured in a browser, because `happy-dom` lays nothing out: the frame was `w-fit`, which shrinks to
// the canvas's own `minWidth` — so the SVG's `w-full` resolved against 1040px rather than against the
// 1412px pane it was in, and the canvas stopped a third of the way short of the right edge with bare
// ground beside it. `min-w-fit` keeps a plan wider than the pane from being squashed, and `w-full` is
// what reaches the edge of one wider than the plan.
describe('how wide the frame around the canvas is', () => {
  it('fills a pane wider than the plan and never shrinks below the plan itself', () => {
    shown(stubActions())
    const root = only('[data-slot="drag-root"]')
    expect(root?.className).toContain('w-full')
    expect(root?.className).toContain('min-w-fit')
    expect(root?.className.split(' ')).not.toContain('w-fit')
  })
})
