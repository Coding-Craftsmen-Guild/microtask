import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { ACTION_REFUSALS } from '../../../lib/refusal'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, PLAN_A } from '../testing/plan-fixture'
import type { CycleFeature } from './cycle-check'
import { DependencyEditor } from './dependency-editor'
import { NOTHING_TO_WAIT_ON } from './field'

type Write = (
  planId: string,
  featureId: string,
  dependsOn: readonly string[],
) => Promise<ActionResult<Plan>>

const FEATURE_3 = '01MPFFFFFFFFFFFFFFFFFFFFF3'

const ATLAS = atlasPlan().features

const REPORTING: CycleFeature = {
  id: FEATURE_3,
  epicId: EPIC_1,
  name: 'Reporting',
  position: 2,
  estimateDays: 2,
  pinSprint: null,
  dependsOn: [],
}

// Atlas's two features and a third, each feature's edge list replaceable by id: so a graph is stated
// as the edges that make the case, over the real fixture records rather than over invented ones.
const graph = (edges: Readonly<Record<string, readonly string[]>> = {}): readonly CycleFeature[] =>
  [...ATLAS, REPORTING].map((one) => ({ ...one, dependsOn: edges[one.id] ?? one.dependsOn }))

const ONLY_ONE = ATLAS.filter((one) => one.id === FEATURE_1)

// What the API really answers: the plan, with the edge list the write asked for actually stored.
const stored = (featureId: string, dependsOn: readonly string[]): ActionResult<Plan> => ({
  ok: true,
  value: atlasPlan({
    features: atlasPlan().features.map((one) => (one.id === featureId ? { ...one, dependsOn } : one)),
  }),
})

const kept: Write = (_planId, featureId, dependsOn) => Promise.resolve(stored(featureId, dependsOn))

const refused =
  (status: number, detail: string): Write =>
  () =>
    Promise.resolve({ ok: false, status, detail })

const setup = (
  featureId: string = FEATURE_1,
  features: readonly CycleFeature[] = graph(),
  write: Write = kept,
) => {
  const onWrite = vi.fn(write)
  render(
    <DependencyEditor
      featureId={featureId}
      features={features}
      planId={PLAN_A}
      setDependencies={onWrite}
    />,
  )
  return { onWrite, user: userEvent.setup() }
}

const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })

const labelled = (input: Element): string =>
  document.querySelector(`label[for="${input.getAttribute('id') ?? ''}"]`)?.textContent ?? ''

const names = (): readonly string[] => screen.getAllByRole('checkbox').map(labelled)

const said = (): readonly string[] =>
  [...document.querySelectorAll('[role="alert"]')].map((one) => one.textContent ?? '')

describe('the candidates, which are this plan’s other features and never a search', () => {
  it('captions the group by what an edge means rather than by the field it writes', () => {
    setup()
    expect(screen.getByText('Waits on')).toBeTruthy()
  })

  it('offers every other feature of this plan, and never the feature the drawer is open on', () => {
    setup(FEATURE_1)
    expect(names()).toEqual(['Billing', 'Reporting'])
  })

  it('ticks the box of an edge the feature already states, so the list on screen is the stored one', () => {
    setup(FEATURE_2)
    expect(box('Auth rewrite').checked).toBe(true)
    expect(box('Reporting').checked).toBe(false)
  })

  it('draws no control at all for a plan with nothing else to wait on, and says so', () => {
    setup(FEATURE_1, ONLY_ONE)
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.getByText(NOTHING_TO_WAIT_ON)).toBeTruthy()
  })
})

// `PUT .../dependencies` replaces the set: there is no add and no remove, so every click sends the
// feature's whole list, plus or minus the one candidate that was clicked.
describe('the whole list, because the route replaces it', () => {
  it('sends the list plus one for a candidate the feature did not wait on', async () => {
    const { onWrite, user } = setup(FEATURE_2)
    await user.click(box('Reporting'))
    expect(onWrite).toHaveBeenCalledWith(PLAN_A, FEATURE_2, [FEATURE_1, FEATURE_3])
  })

  it('sends the list minus one for a candidate it did, a removal being the same whole write', async () => {
    const { onWrite, user } = setup(FEATURE_2)
    await user.click(box('Auth rewrite'))
    expect(onWrite).toHaveBeenCalledWith(PLAN_A, FEATURE_2, [])
  })

  it('sends one request per click and never a second for the same box', async () => {
    const { onWrite, user } = setup(FEATURE_1)
    await user.click(box('Reporting'))
    expect(onWrite).toHaveBeenCalledTimes(1)
  })
})

/**
 * **The phase's acceptance gate: cycle refusal pinned by test.**
 *
 * The API refuses a cycle as a 409 whose `detail` names raw ids, and `lib/problem.ts` answers every
 * refusal with the audience's plain sentence for its status and never the API's — so a cycle sent to
 * the server comes back to a reader as "Someone else changed this at the same time", which is false
 * of a cycle. The refusal is therefore worked out before the write leaves, over names.
 */
describe('the cycle refusal this phase is gated on', () => {
  it('refuses a cycle by naming the features that would wait on each other, and sends nothing', async () => {
    const { onWrite, user } = setup(FEATURE_1)
    await user.click(box('Billing'))
    expect(said()).toEqual(['These features would wait on each other: Auth rewrite, Billing.'])
    expect(onWrite).not.toHaveBeenCalled()
  })

  it('leaves the box showing the stored list, the refused edge not being one of them', async () => {
    const { user } = setup(FEATURE_1)
    await user.click(box('Billing'))
    expect(box('Billing').checked).toBe(false)
  })

  it('names the refusal as the box’s own description, so it is heard on the way back to it', async () => {
    const { user } = setup(FEATURE_1)
    await user.click(box('Billing'))
    const described = box('Billing').getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(described)?.textContent).toContain('wait on each other')
    expect(box('Billing').getAttribute('aria-invalid')).toBe('true')
  })

  // Any cycle in the resulting graph refuses the write, not only one through the edge just added: a
  // plan already holding one refuses an unrelated edge, and a user not told that reads the editor as
  // broken (`packages/macroplan-domain/src/services/feature-service.ts`).
  it('refuses an unrelated edge while the plan already holds a cycle somewhere else', async () => {
    const broken = graph({ [FEATURE_2]: [FEATURE_3], [FEATURE_3]: [FEATURE_2] })
    const { onWrite, user } = setup(FEATURE_1, broken)
    await user.click(box('Billing'))
    expect(said()).toEqual(['These features would wait on each other: Billing, Reporting.'])
    expect(onWrite).not.toHaveBeenCalled()
  })

  it('clears a standing refusal once a later click on the same box is served', async () => {
    let first = true
    const flaky: Write = (planId, featureId, dependsOn) => {
      if (!first) return kept(planId, featureId, dependsOn)
      first = false
      return Promise.resolve({ ok: false, status: 503, detail: ACTION_REFUSALS.admin.busy })
    }
    const { user } = setup(FEATURE_2, graph(), flaky)
    await user.click(box('Reporting'))
    expect(said()).toEqual([ACTION_REFUSALS.admin.busy])
    await user.click(box('Reporting'))
    expect(said()).toEqual([])
    expect(box('Reporting').checked).toBe(true)
  })
})

// The local check is a message and never a gate: the write is still sent in every case it passes, and
// whatever comes back is rendered under the box that sent it.
describe('the API stays the authority, and its refusal is what is shown', () => {
  it('shows the conflict sentence for a 409 that comes back anyway', async () => {
    const conflict = ACTION_REFUSALS.admin.conflict
    const { user } = setup(FEATURE_2, graph(), refused(409, conflict))
    await user.click(box('Reporting'))
    expect(said()).toEqual([conflict])
  })

  it('shows the 403 a seat re-roled between render and click meets', async () => {
    const forbidden = ACTION_REFUSALS.admin.forbidden
    const { user } = setup(FEATURE_2, graph(), refused(403, forbidden))
    await user.click(box('Reporting'))
    expect(said()).toEqual([forbidden])
    expect(box('Reporting').checked).toBe(false)
  })

  it('shows the no-answer sentence when the call rejects rather than answering', async () => {
    const { user } = setup(FEATURE_2, graph(), () => Promise.reject(new Error('socket')))
    await user.click(box('Reporting'))
    expect(said()).toEqual([NO_ANSWER.detail])
  })
})

describe('what is on screen after a write is what the server stored', () => {
  it('ticks the box from the plan the write answered with, not from the list it sent', async () => {
    const { user } = setup(FEATURE_2, graph(), () => Promise.resolve(stored(FEATURE_2, [])))
    await user.click(box('Reporting'))
    expect(box('Reporting').checked).toBe(false)
  })

  it('leaves it ticked when the answered plan really holds the edge', async () => {
    const { user } = setup(FEATURE_1)
    await user.click(box('Reporting'))
    expect(box('Reporting').checked).toBe(true)
  })
})
