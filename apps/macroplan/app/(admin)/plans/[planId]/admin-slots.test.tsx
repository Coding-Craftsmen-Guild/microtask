import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { handedBy, tokensHandedBy } from '../../../../components/plan/testing/handed'
import { atlasPlan, PLAN_A } from '../../../../components/plan/testing/plan-fixture'
import { planScreenModel } from '../../../../components/plan/plan-screen-model'

vi.mock('next/link', async () => ({
  default: (await import('../../../../components/plan/testing/next-link')).LinkDouble,
}))

const { manageSlot } = await import('./admin-slots')

const PLAN = planScreenModel(atlasPlan())

// The guard that was in `form-drawers.test.tsx` while settings and sharing were routes. They are two
// menus in the plan head row now, so the check lives where the actions are handed — ADR 0040's rule is
// that a bound action is the one way a credential reaches a component invisibly, and
// `Function.prototype.bind` names its result `bound <name>`.
describe('the whole-plan menus, which hand their own actions by name and nothing bound', () => {
  it('hands exactly the three plan-own writes and the four seat writes, and nothing else', () => {
    const handed = handedBy(manageSlot(PLAN))
    expect([...new Set(handed.functions)].sort()).toEqual([
      'createPlanSeat',
      'deletePlan',
      'readPlanSeats',
      'renamePlan',
      'retimePlan',
      'revokePlanSeat',
      'updatePlanSeat',
    ])
  })

  it('binds none of them, a bound action being how a token travels unseen', () => {
    const handed = handedBy(manageSlot(PLAN))
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })

  it('hands no seat token down, checked against the three the fixture really has', () => {
    const tokens = atlasPlan().shareLinks.map((seat) => seat.token)
    expect(tokensHandedBy(manageSlot(PLAN), tokens)).toEqual([])
  })

  it('hands the share control the plan id and no plan, so no seat can reach its payload', () => {
    expect(handedBy(manageSlot(PLAN)).strings).toContain(PLAN_A)
  })
})

describe('what the two menus draw', () => {
  it('opens settings with a button over a panel, both shut, and neither over the board', () => {
    render(manageSlot(PLAN))
    const menu = document.querySelector('[data-slot="plan-settings-menu"]')
    expect(menu?.tagName).toBe('DETAILS')
    expect(menu?.hasAttribute('open')).toBe(false)
    expect(menu?.querySelector('summary')?.textContent).toBe('Settings')
  })

  it('puts the plan’s three forms inside that panel rather than behind a route', () => {
    render(manageSlot(PLAN))
    const panel = document.querySelector('[data-slot="plan-settings-menu-panel"]')
    expect(panel?.textContent).toContain('Name')
    expect(panel?.textContent).toContain('Calendar')
    expect(panel?.textContent).toContain('Delete this plan')
  })

  it('draws Share as its own control, which is the one panel that may not be mounted shut', () => {
    render(manageSlot(PLAN))
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(document.querySelector('[data-slot="plan-share-panel"]')).toBeNull()
  })
})
