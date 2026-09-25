import { LIMITS } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { atlasPlan, FEATURE_1, FEATURE_2 } from '../testing/plan-fixture'
import { splitEdges } from './field'
import {
  cycleSentence,
  edgeChoices,
  edgeEntry,
  proposedCycle,
  SELF_EDGE,
  tooManyEdges,
  type CycleFeature,
} from './cycle-check'

const feature = (id: string, name: string, dependsOn: readonly string[] = []): CycleFeature => ({
  id,
  name,
  epicId: 'epic',
  position: 0,
  estimateDays: 1,
  pinSprint: null,
  dependsOn,
})

const A = '01MPFFFFFFFFFFFFFFFFFFFFFA'
const B = '01MPFFFFFFFFFFFFFFFFFFFFFB'
const C = '01MPFFFFFFFFFFFFFFFFFFFFFC'

const chain = () => [feature(A, 'Auth'), feature(B, 'Billing', [A]), feature(C, 'Cron', [B])]

const detail = (
  features: readonly CycleFeature[],
  featureId: string,
  dependsOn: readonly string[],
): readonly string[] | string => {
  const entry = edgeEntry(features, featureId, dependsOn)
  return entry.kind === 'edges' ? entry.dependsOn : entry.detail
}

// A plan sitting exactly at the edge cap, built as one feature holding every edge there is, so the
// budget arithmetic below is asked at the boundary rather than near it.
const atCap = (): readonly CycleFeature[] => [
  feature(A, 'Auth', Array.from({ length: LIMITS.edgesPerPlan }, (_one, at) => `edge-${String(at)}`)),
  feature(B, 'Billing'),
]

describe('the cycle a proposed dependency would create, named for a reader', () => {
  it('answers null for an edge that closes nothing', () => {
    expect(proposedCycle(chain(), A, [])).toBeNull()
    expect(proposedCycle(chain(), C, [B])).toBeNull()
  })

  it('answers the features of the cycle the new edge would close, by name', () => {
    const found = proposedCycle(chain(), A, [C])
    expect(found?.featureIds).toEqual([A, B, C])
    expect(found?.sentence).toBe('These features would wait on each other: Auth, Billing, Cron.')
  })

  it('answers the two features of a two-cycle, which is the smallest one a UI can build', () => {
    const found = proposedCycle([feature(A, 'Auth'), feature(B, 'Billing', [A])], A, [B])
    expect(found?.featureIds).toEqual([A, B])
    expect(found?.sentence).toBe('These features would wait on each other: Auth, Billing.')
  })

  it('reads the graph the write would leave, not the one on disk', () => {
    const already = [feature(A, 'Auth', [C]), feature(B, 'Billing', [A]), feature(C, 'Cron', [B])]
    expect(proposedCycle(already, A, [])).toBeNull()
  })

  // `findCycles` drops an edge naming a feature the plan does not hold, so a dangling edge cannot
  // produce a refusal naming something a reader could never find on screen.
  it('drops an edge that names nothing rather than refusing a write over it', () => {
    const orphan = [feature(A, 'Auth', ['gone']), feature(B, 'Billing')]
    expect(proposedCycle(orphan, B, [A])).toBeNull()
  })
})

// The three behaviours `packages/macroplan-domain/src/services/feature-service.ts` really has, each
// asked of this module in the terms the service has them in.
describe('the self-edge the server refuses separately, and which is not a cycle', () => {
  it('refuses it in its own words rather than as a cycle of one', () => {
    expect(detail(chain(), A, [A])).toBe(SELF_EDGE)
    expect(SELF_EDGE).not.toContain('wait on each other')
  })

  it('refuses it before the cycle question, which findCycles would answer first', () => {
    expect(proposedCycle(chain(), A, [A])?.featureIds).toEqual([A])
    expect(detail(chain(), A, [A])).toBe(SELF_EDGE)
  })

  it('refuses a list that names the feature among other ids, not only one that is only it', () => {
    expect(detail(chain(), C, [B, C])).toBe(SELF_EDGE)
  })
})

describe('any cycle in the resulting graph, and not only one through the edge just added', () => {
  // The service runs findCycles over every feature it is about to save and refuses on any cycle it
  // finds, so a plan already holding one refuses an unrelated edge — and a user not told that reads
  // the editor as broken.
  it('refuses an unrelated edge while the plan already holds a cycle somewhere else', () => {
    const broken = [
      feature(A, 'Auth', [B]),
      feature(B, 'Billing', [A]),
      feature(C, 'Cron'),
      feature('01MPFFFFFFFFFFFFFFFFFFFFFD', 'Docs'),
    ]
    expect(detail(broken, C, ['01MPFFFFFFFFFFFFFFFFFFFFFD'])).toBe(
      'These features would wait on each other: Auth, Billing.',
    )
  })

  it('refuses even a write that removes every edge the feature had, the other cycle standing', () => {
    const broken = [feature(A, 'Auth', [B]), feature(B, 'Billing', [A]), feature(C, 'Cron', [A])]
    expect(detail(broken, C, [])).toBe('These features would wait on each other: Auth, Billing.')
  })
})

describe('the dedupe and the edge budget, both as the service counts them', () => {
  it('stores a repeated id once, which is also all it costs', () => {
    expect(detail(chain(), C, [A, A, B])).toEqual([A, B])
  })

  // `assertWithin('edgesPerPlan', total - 1)` throws on `total - 1 >= LIMITS.edgesPerPlan`, so the
  // write the server serves is every one whose resulting total is `LIMITS.edgesPerPlan` or less. A
  // client comparing the total against the constant with `>=` refuses the last edge the API accepts.
  it('accepts the write that leaves the plan holding exactly the cap', () => {
    const features = [feature(A, 'Auth', ['edge-0']), feature(B, 'Billing')]
    const edges = Array.from({ length: LIMITS.edgesPerPlan }, (_one, at) => `edge-${String(at)}`)
    expect(detail(features, A, edges)).toEqual(edges)
  })

  it('refuses the write that would leave one more than the cap', () => {
    const edges = Array.from({ length: LIMITS.edgesPerPlan + 1 }, (_one, at) => `edge-${String(at)}`)
    expect(detail(atCap(), A, edges)).toBe(tooManyEdges(LIMITS.edgesPerPlan + 1))
  })

  // Subtracting the feature's own current edges first is what lets a plan sitting exactly at the cap
  // still have its edge lists edited, instead of freezing every one of them at once.
  it('lets a plan at the cap still edit the list that is holding it there', () => {
    expect(detail(atCap(), A, [B])).toEqual([B])
  })

  it('counts the whole plan and not one feature, so another feature’s edges can refuse this one', () => {
    const edges = Array.from({ length: LIMITS.edgesPerPlan }, (_one, at) => `edge-${String(at)}`)
    const full = [feature(A, 'Auth', edges), feature(B, 'Billing'), feature(C, 'Cron')]
    expect(detail(full, B, [C])).toBe(tooManyEdges(LIMITS.edgesPerPlan + 1))
  })

  it('counts the deduped list, because that is what would be written', () => {
    const edges = Array.from({ length: LIMITS.edgesPerPlan }, (_one, at) => `edge-${String(at)}`)
    const full = [feature(A, 'Auth', edges), feature(B, 'Billing'), feature(C, 'Cron')]
    expect(detail(full, B, [C, C, C])).toBe(tooManyEdges(LIMITS.edgesPerPlan + 1))
  })

  it('names the total and the cap, so the sentence can be checked against the plan', () => {
    expect(tooManyEdges(401)).toContain('401')
    expect(tooManyEdges(401)).toContain(String(LIMITS.edgesPerPlan))
  })
})

describe('the sentence itself, which is the server’s wording over names rather than ids', () => {
  it('lists the names in the order it was given them', () => {
    expect(cycleSentence(['Auth', 'Billing'])).toBe(
      'These features would wait on each other: Auth, Billing.',
    )
  })
})

describe('one choice per other feature in the plan, which is the whole candidate list', () => {
  const FEATURES = atlasPlan().features

  it('offers every other feature of this plan and never the subject itself', () => {
    expect(edgeChoices(FEATURES, FEATURE_1).map((one) => one.featureId)).toEqual([FEATURE_2])
    expect(edgeChoices(FEATURES, FEATURE_2).map((one) => one.featureId)).toEqual([FEATURE_1])
  })

  it('answers nothing at all for a feature the plan does not hold', () => {
    expect(edgeChoices(FEATURES, 'gone')).toEqual([])
  })

  it('says which of them this feature already waits on', () => {
    expect(edgeChoices(FEATURES, FEATURE_2)[0]).toMatchObject({ name: 'Auth rewrite', waiting: true })
    expect(edgeChoices(FEATURES, FEATURE_1)[0]).toMatchObject({ name: 'Billing', waiting: false })
  })

  it('sends the whole list plus one for a candidate this feature does not wait on', () => {
    const chosen = edgeChoices(chain(), C)
    expect(splitEdges(chosen.find((one) => one.featureId === A)?.sendIds ?? '')).toEqual([B, A])
  })

  it('sends the whole list minus one for a candidate it does, which is how a removal travels', () => {
    const chosen = edgeChoices(chain(), C)
    expect(splitEdges(chosen.find((one) => one.featureId === B)?.sendIds ?? '')).toEqual([])
  })

  it('carries the refusal for the candidate that would close a cycle, and none for the rest', () => {
    const chosen = edgeChoices(FEATURES, FEATURE_1)
    expect(chosen[0]?.refusal).toBe(
      'These features would wait on each other: Auth rewrite, Billing.',
    )
    expect(edgeChoices(FEATURES, FEATURE_2)[0]?.refusal).toBe('')
  })

  it('carries a refusal on every candidate while the plan already holds a cycle', () => {
    const broken = [feature(A, 'Auth', [B]), feature(B, 'Billing', [A]), feature(C, 'Cron')]
    expect(edgeChoices(broken, C).map((one) => one.refusal === '')).toEqual([false, false])
  })
})
