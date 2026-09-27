import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan } from '../testing/plan-fixture'
import { stubPlanWrites } from '../testing/plan-writes'
import { SettingsPanel } from './settings-panel'
import { SETTINGS_WORDS } from './settings-words'
import { TIMING_WORDS } from './timing-fields'

const PLAN = planScreenModel(atlasPlan())

const setup = (over: Partial<Parameters<typeof SettingsPanel>[0]> = {}) => {
  const writes = stubPlanWrites()
  render(
    <SettingsPanel
      mayRemove
      mayRename
      mayRetime
      plan={PLAN}
      remove={writes.remove}
      rename={writes.rename}
      retime={writes.retime}
      {...over}
    />,
  )
  return writes
}

const panel = () => document.querySelector('[data-slot="settings-panel"]')

describe('SettingsPanel', () => {
  it('draws the three sections a reader holding everything may use', () => {
    setup()
    expect(screen.getByText(SETTINGS_WORDS.name)).toBeDefined()
    expect(screen.getByText(SETTINGS_WORDS.timing)).toBeDefined()
    expect(screen.getByText(SETTINGS_WORDS.danger)).toBeDefined()
  })

  it('opens the name and the calendar fields with what the plan actually holds', () => {
    setup()
    expect(screen.getByLabelText<HTMLInputElement>('Plan name').value).toBe(PLAN.name)
    expect(screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.start).value).toBe(PLAN.startDate)
    expect(screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.zone).value).toBe(PLAN.timezone)
  })

  it('is closed, so five managers above a timeline do not push the bars off the screen', () => {
    setup()
    expect(panel()?.hasAttribute('open')).toBe(false)
  })

  // Each section is drawn on its own answer. `plan:rename`, `plan:retime` and `plan:delete` are three
  // actions, so a reader holding one and not another is a real principal — and an unread boolean is the
  // decoration `lib/plan-capabilities.ts` warns about.
  it('draws only the name for a reader who may rename and nothing else', () => {
    setup({ mayRetime: false, mayRemove: false })
    expect(screen.getByLabelText('Plan name')).toBeDefined()
    expect(screen.queryByLabelText(TIMING_WORDS.start)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('draws only the calendar for a reader who may retime and nothing else', () => {
    setup({ mayRename: false, mayRemove: false })
    expect(screen.queryByLabelText('Plan name')).toBeNull()
    expect(screen.getByLabelText(TIMING_WORDS.start)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('draws only the delete for a reader who may only delete', () => {
    setup({ mayRename: false, mayRetime: false })
    expect(screen.queryByLabelText('Plan name')).toBeNull()
    expect(screen.queryByLabelText(TIMING_WORDS.start)).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
  })

  // Not an empty disclosure. A control that opens onto nothing is worse than no control, and the page's
  // own decision to mount this is a different question — it mounts on any one of the three, so this is
  // the second of the two halves rather than a duplicate of it.
  it('draws nothing at all for a reader refused all three', () => {
    setup({ mayRename: false, mayRetime: false, mayRemove: false })
    expect(panel()).toBeNull()
  })
})
