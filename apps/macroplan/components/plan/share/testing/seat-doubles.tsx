import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import type { PlanSeatControls } from '../../../../lib/plan-capabilities'
import { PLAN_A, atlasPlan } from '../../testing/plan-fixture'
import { ShareManager } from '../share-manager'
import type { PlanSeat, PlanSeatActions } from '../use-plan-seats'

/** The token the doubles below mint, which no fixture plan holds. */
export const MINTED_TOKEN = 'a_minted_seats_tokn'

/**
 * The seats the Atlas fixture really holds: Dana `view`, Ivo `write`, Ravi `manage`.
 *
 * Read off the fixture rather than written here, so the tokens a test asserts are absent from a closed
 * manager are the same three every other leak sweep in this app is written against.
 */
export const seatsOnAtlas = (): readonly PlanSeat[] => atlasPlan().shareLinks

/** Every seat action as a recording double that succeeds. */
export const seatDoubles = (): PlanSeatActions => ({
  list: vi.fn<PlanSeatActions['list']>(() => Promise.resolve({ ok: true, value: seatsOnAtlas() })),
  create: vi.fn<PlanSeatActions['create']>((_planId, seat) =>
    Promise.resolve({
      ok: true,
      value: {
        token: MINTED_TOKEN,
        name: seat.name,
        role: seat.role,
        createdBy: null,
        createdAt: '2026-09-25T10:00:00.000Z',
      },
    }),
  ),
  update: vi.fn<PlanSeatActions['update']>((_planId, token, change) => {
    const stored = seatsOnAtlas().find((one) => one.token === token)
    if (stored === undefined) throw new Error(`the fixture holds no seat ${token}`)
    const value = { ...stored, name: change.name ?? stored.name, role: change.role ?? stored.role }
    return Promise.resolve({ ok: true, value })
  }),
  revoke: vi.fn<PlanSeatActions['revoke']>(() => Promise.resolve({ ok: true, value: undefined })),
})

/** What a test may vary about the manager it renders. */
export interface ManagerSetup {
  /** Which controls the surface draws; the admin's four by default. */
  readonly controls?: PlanSeatControls

  /** The doubles, when a test needs to arm one before rendering. */
  readonly actions?: PlanSeatActions
}

/**
 * Renders the manager the way a page fills the screen's `share` slot, and answers the doubles.
 *
 * Every control comes from a {@link PlanSeatControls}, `ADMIN_CONTROLS.seats` by default, so a test
 * varying them says which surface it means rather than listing four booleans.
 *
 * @param setup - The controls and the doubles to render with.
 * @returns The doubles, the render result and a user to drive it.
 */
export const renderManager = (setup: ManagerSetup = {}) => {
  const actions = setup.actions ?? seatDoubles()
  const controls = setup.controls ?? ADMIN_CONTROLS.seats
  const view = render(
    <ShareManager
      editSeat={actions.update}
      listSeats={actions.list}
      mayCreate={controls.create}
      mayRead={controls.read}
      mayRevoke={controls.revoke}
      mayUpdate={controls.update}
      mintSeat={actions.create}
      planId={PLAN_A}
      revokeSeat={actions.revoke}
    />,
  )
  return { actions, view, user: userEvent.setup() }
}
