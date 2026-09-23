import { describe, expect, it } from 'vitest'
import * as contracts from '@repo/contracts'
import type { EpicBinding } from './binding.js'
import type { PlanEpic } from './epic.js'
import type { PlanFeature } from './feature.js'
import type { ItemDocument, PlanItem } from './item.js'
import type { PlanManifest, PlanShareLink } from './plan.js'
import { STAMP, epic, feature, item, itemDocument, marked, planManifest } from '../testing/index.js'

type Parsed<Schema extends { parse: (input: unknown) => unknown }> = ReturnType<Schema['parse']>

type Immutable<T> = T extends readonly (infer Element)[]
  ? readonly Immutable<Element>[]
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T

type MatchesContract<Entity extends Immutable<Output>, Output> = Entity

type Checked = readonly [
  MatchesContract<EpicBinding, Parsed<typeof contracts.EpicBinding>>,
  MatchesContract<PlanEpic, Parsed<typeof contracts.PlanEpic>>,
  MatchesContract<PlanFeature, Parsed<typeof contracts.PlanFeature>>,
  MatchesContract<PlanItem, Parsed<typeof contracts.PlanItem>>,
  MatchesContract<PlanShareLink, Parsed<typeof contracts.PlanShareLink>>,
  MatchesContract<PlanManifest, Parsed<typeof contracts.PlanManifest>>,
  MatchesContract<ItemDocument, Parsed<typeof contracts.ItemDocument>>,
]

const PLAN = marked('PN', 1)
const EPIC = marked('EP', 1)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TOKEN = 'shr_ptarmigan_planseatone'

const seat: PlanShareLink = {
  token: TOKEN,
  name: 'Jane at ACME',
  role: 'manage',
  createdBy: null,
  createdAt: STAMP,
}

const binding: EpicBinding = { projectId: PROJECT, role: 'view', sealedToken: 'sealed' }

const populated: PlanManifest = planManifest(PLAN, {
  epics: [epic(EPIC, { binding })],
  features: [feature(FEATURE, EPIC, { dependsOn: [marked('FT', 2)], pinSprint: 1 })],
  items: [item(ITEM, FEATURE, { linkedTaskId: PROJECT })],
  shareLinks: [seat],
})

describe('entities and contracts describe the same shapes', () => {
  it('keeps every stored entity assignable to the output of the schema that will serve it', () => {
    const proof: Checked | null = null
    expect(proof).toBeNull()
  })

  it('parses a fully populated manifest, which the type check alone cannot prove because Timezone’s refinement does not reach the inferred type', () => {
    const parsed = contracts.PlanManifest.safeParse(populated)
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('parses a seat on its own, the shape a plan stores with no scope beside it', () => {
    const parsed = contracts.PlanShareLink.safeParse(seat)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(Object.keys(parsed.data ?? {})).not.toContain('scope')
  })

  it('parses an item file, which travels beside the manifest rather than inside it', () => {
    expect(contracts.ItemDocument.safeParse(itemDocument(ITEM)).error?.issues ?? []).toEqual([])
  })
})
