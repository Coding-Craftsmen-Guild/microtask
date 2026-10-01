import { PLAN_ROOT } from '../shell/shell-css'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { EPIC_1, FEATURE_1, FEATURE_2, railedPlan } from '../testing/plan-fixture'
import {
  featureRadioId,
  NOTHING_SELECTED_ID,
  railRadioId,
  SELECT_DIMMED,
  SELECT_RADIO_NAME,
  selectCss,
} from './select-css'
import { sidebarRails } from './sidebar-rows'

const RAILS = sidebarRails(planScreenModel(railedPlan()))

const css = (): string => selectCss(RAILS)

describe('the ids and the one name the selection is wired with', () => {
  it('keys a radio on the subject it selects, so a rail and a feature cannot collide', () => {
    expect(railRadioId(EPIC_1)).toBe(`mp-sel-rail-${EPIC_1}`)
    expect(featureRadioId(FEATURE_1)).toBe(`mp-sel-feature-${FEATURE_1}`)
    expect(railRadioId(EPIC_1)).not.toBe(featureRadioId(EPIC_1))
  })

  // One `name` across rails and features together, which is what makes it one selection: choosing a rail
  // unchooses a feature and the reverse, so there are never two things selected that could disagree.
  it('shares one radio name, and one id for nothing selected', () => {
    expect(SELECT_RADIO_NAME).toBe('plan-selection')
    expect(NOTHING_SELECTED_ID).toBe('mp-sel-none')
  })
})

describe('selectCss dims what was not chosen', () => {
  it('dims every other rail group when a rail is chosen, its name included', () => {
    expect(css()).toContain(
      `${PLAN_ROOT}:has(#${railRadioId(EPIC_1)}:checked) [data-slot="rail"]:not([data-epic-id="${EPIC_1}"]){opacity:${SELECT_DIMMED}}`,
    )
  })

  it('dims every other mark when a feature is chosen, which reaches its own rail too', () => {
    expect(css()).toContain(
      `${PLAN_ROOT}:has(#${featureRadioId(FEATURE_1)}:checked) [data-feature-id]:not([data-feature-id="${FEATURE_1}"]){opacity:${SELECT_DIMMED}}`,
    )
  })

  // A dependency belongs to two features, so the honest test is whether the chosen one is either end.
  it('leaves an arc alone only when the chosen feature is one of its two ends', () => {
    expect(css()).toContain(
      `[data-slot="arc"]:not([data-arc-from="${FEATURE_1}"]):not([data-arc-to="${FEATURE_1}"]){opacity:${SELECT_DIMMED}}`,
    )
  })

  // CSS cannot ask whether an arc's far end is on the chosen rail — an arc carries two feature ids and not
  // their rails — so the choice is between dimming all of them and dimming none, and none is right.
  it('writes no arc rule for a rail, since a rail selection must not hide the couplings', () => {
    const railBlock = css().split(`#${railRadioId(EPIC_1)}:checked`)[1]?.split('}')[0] ?? ''
    expect(railBlock).not.toContain('data-arc-from')
  })

  it('writes one rule per rail and two per feature, and nothing else', () => {
    const features = RAILS.flatMap((rail) => rail.features)
    expect(css().split('}').filter((one) => one !== '')).toHaveLength(
      RAILS.length + features.length * 2,
    )
  })

  it('covers every feature of every rail, so no row selects and dims nothing', () => {
    for (const rail of RAILS) {
      for (const feature of rail.features) {
        expect(css()).toContain(`#${featureRadioId(feature.id)}:checked`)
      }
    }
    expect(css()).toContain(`#${featureRadioId(FEATURE_2)}:checked`)
  })

  it('answers an empty stylesheet for a plan with no rails, rather than a rule matching everything', () => {
    expect(selectCss([])).toBe('')
  })

  // The guard is `isStyleSafeId`'s, imported from the group's module rather than written again, so there is
  // one answer to which ids are safe to interpolate into a selector.
  it('skips an id that is not ULID-shaped rather than escaping it into a rule', () => {
    const forged = selectCss([
      { id: 'a"]{}', name: 'x', colour: '#000000', features: [{ id: 'b"]{}', name: 'y', detail: '' }] },
    ])
    expect(forged).toBe('')
  })
})
