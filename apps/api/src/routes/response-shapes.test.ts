import * as contracts from '@repo/contracts'
import { STAMP, sequentialIds } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { zipOfFiles } from '../testing/archives.js'
import { docConfig } from '../http/docs.js'
import {
  GUARDED_PREFIX,
  IDS,
  SERVICE_KEY,
  TOKENS,
  admin,
  adminJson,
  asLink,
  buildApp,
} from '../testing/harness.js'
import { MACROPLAN_PREFIX } from '../testing/macroplan-harness.js'

const PROJECT = `${GUARDED_PREFIX}/projects/{projectId}`
const TASK = `${PROJECT}/tasks/{taskId}`
const P1 = `${GUARDED_PREFIX}/projects/${IDS.p1}`
const T1 = `${P1}/tasks/${IDS.t1}`
const PLANS = `${MACROPLAN_PREFIX}/plans`
const PLAN = `${PLANS}/{planId}`

interface Step {
  readonly method: string
  readonly path: string
  readonly headers: Record<string, string>
  readonly body?: string | Uint8Array
}

interface Sample {
  readonly path: string
  readonly headers: Record<string, string>
  readonly body?: string
  readonly setup?: readonly Step[]
}

const json = (value: unknown): string => JSON.stringify(value)

const MINTED = sequentialIds()

const FIRST_SESSION = MINTED.entityId()
const FIRST_EPIC = MINTED.entityId()
const FIRST_FEATURE = MINTED.entityId()
const FIRST_ITEM = MINTED.entityId()

const OPEN_SESSION: Step = {
  method: 'POST',
  path: `${GUARDED_PREFIX}/import/sessions`,
  headers: admin(),
}

const DRAFT_PLAN = JSON.stringify({ name: 'A roadmap', startDate: '2026-03-02' })

/**
 * The three plan-scoped operations need a plan, and `buildApp`'s fixture holds none.
 *
 * So they draft one first and then address it by the id a fresh `sequentialIds()` mints first —
 * the same trick `FIRST_SESSION` uses above, and sound for the same reason: each sample gets its
 * own app, and this setup step is the first thing in it to mint an id.
 */
const DRAFT_A_PLAN: Step = {
  method: 'POST',
  path: `${MACROPLAN_PREFIX}/plans`,
  headers: adminJson(),
  body: DRAFT_PLAN,
}

const FIRST_PLAN_PATH = `${MACROPLAN_PREFIX}/plans/${FIRST_SESSION}`

/**
 * The structural routes need a rail, a feature on it and an item under that, in that order.
 *
 * Each builds on the one before it and each mints the next id from the same generator the plan draft
 * started, so `FIRST_EPIC`, `FIRST_FEATURE` and `FIRST_ITEM` are the second, third and fourth ids a
 * fresh app hands out. Sound for the same reason `FIRST_SESSION` is: every sample gets its own app,
 * and these steps are the only things in it minting ids before the sample runs.
 */
const ADD_AN_EPIC: Step = {
  method: 'POST',
  path: `${FIRST_PLAN_PATH}/epics`,
  headers: adminJson(),
  body: JSON.stringify({ name: 'Checkout' }),
}

const ADD_A_FEATURE: Step = {
  method: 'POST',
  path: `${FIRST_PLAN_PATH}/features`,
  headers: adminJson(),
  body: JSON.stringify({ epicId: FIRST_EPIC, name: 'Basket', estimateDays: 4 }),
}

const ADD_AN_ITEM: Step = {
  method: 'POST',
  path: `${FIRST_PLAN_PATH}/items`,
  headers: adminJson(),
  body: JSON.stringify({ featureId: FIRST_FEATURE, name: 'Add to basket', estimateDays: 1 }),
}

const ON_A_PLAN = [DRAFT_A_PLAN] as const
const ON_A_RAIL = [DRAFT_A_PLAN, ADD_AN_EPIC] as const
const ON_A_FEATURE = [DRAFT_A_PLAN, ADD_AN_EPIC, ADD_A_FEATURE] as const
const ON_AN_ITEM = [DRAFT_A_PLAN, ADD_AN_EPIC, ADD_A_FEATURE, ADD_AN_ITEM] as const

const EPIC_PATH = `${FIRST_PLAN_PATH}/epics/${FIRST_EPIC}`
const FEATURE_PATH = `${FIRST_PLAN_PATH}/features/${FIRST_FEATURE}`
const ITEM_PATH = `${FIRST_PLAN_PATH}/items/${FIRST_ITEM}`

const STAGE_ARCHIVE: Step = {
  method: 'POST',
  path: `${GUARDED_PREFIX}/import/sessions/${FIRST_SESSION}/files?path=drop.zip&offset=0`,
  headers: { ...admin(), 'content-type': 'application/octet-stream' },
  body: zipOfFiles({ 'drop/project.json': '{ "id": "a staged project" }' }),
}

const SAMPLES: Readonly<Record<string, Sample>> = {
  'POST /v1/auth/login': {
    path: '/v1/auth/login',
    headers: { 'x-api-key': SERVICE_KEY, 'content-type': 'application/json' },
    body: json({ password: 'correct horse battery staple' }),
  },
  [`GET ${GUARDED_PREFIX}/projects`]: { path: `${GUARDED_PREFIX}/projects`, headers: admin() },
  [`POST ${GUARDED_PREFIX}/projects`]: {
    path: `${GUARDED_PREFIX}/projects`,
    headers: adminJson(),
    body: json({ name: 'Second launch' }),
  },
  [`GET ${GUARDED_PREFIX}/search`]: { path: `${GUARDED_PREFIX}/search?q=spec`, headers: admin() },
  [`GET ${GUARDED_PREFIX}/export`]: {
    path: `${GUARDED_PREFIX}/export?tokens=preserve`,
    headers: admin(),
  },
  [`POST ${GUARDED_PREFIX}/import/sessions`]: {
    path: `${GUARDED_PREFIX}/import/sessions`,
    headers: admin(),
  },
  [`POST ${GUARDED_PREFIX}/import/sessions/{sessionId}/files`]: {
    path: `${GUARDED_PREFIX}/import/sessions/${FIRST_SESSION}/files?path=drop/project.json&offset=0`,
    headers: { ...admin(), 'content-type': 'application/octet-stream' },
    body: '{ "id": "a staged file" }',
    setup: [OPEN_SESSION],
  },
  [`POST ${GUARDED_PREFIX}/import/sessions/{sessionId}/archives`]: {
    path: `${GUARDED_PREFIX}/import/sessions/${FIRST_SESSION}/archives?path=drop.zip`,
    headers: admin(),
    setup: [OPEN_SESSION, STAGE_ARCHIVE],
  },
  [`GET ${GUARDED_PREFIX}/import/sessions/{sessionId}/preview`]: {
    path: `${GUARDED_PREFIX}/import/sessions/${FIRST_SESSION}/preview`,
    headers: admin(),
    setup: [OPEN_SESSION, STAGE_ARCHIVE],
  },
  [`POST ${GUARDED_PREFIX}/import/sessions/{sessionId}/confirm`]: {
    path: `${GUARDED_PREFIX}/import/sessions/${FIRST_SESSION}/confirm`,
    headers: adminJson(),
    body: json({ sessionId: FIRST_SESSION, choices: [] }),
    setup: [OPEN_SESSION, STAGE_ARCHIVE],
  },
  [`GET ${GUARDED_PREFIX}/shares/current`]: {
    path: `${GUARDED_PREFIX}/shares/current`,
    headers: asLink(TOKENS.p1View),
  },
  [`GET ${PLANS}`]: { path: PLANS, headers: admin() },
  [`POST ${PLANS}`]: { path: PLANS, headers: adminJson(), body: DRAFT_PLAN },
  [`GET ${PLAN}`]: { path: FIRST_PLAN_PATH, headers: admin(), setup: [DRAFT_A_PLAN] },
  [`PATCH ${PLAN}`]: {
    path: FIRST_PLAN_PATH,
    headers: adminJson(),
    body: json({ name: 'The roadmap', startDate: '2026-04-06' }),
    setup: [DRAFT_A_PLAN],
  },
  [`DELETE ${PLAN}`]: { path: FIRST_PLAN_PATH, headers: admin(), setup: [DRAFT_A_PLAN] },
  [`POST ${PLAN}/epics`]: {
    path: `${FIRST_PLAN_PATH}/epics`,
    headers: adminJson(),
    body: json({ name: 'Billing' }),
    setup: ON_A_PLAN,
  },
  [`PATCH ${PLAN}/epics/{epicId}`]: {
    path: EPIC_PATH,
    headers: adminJson(),
    body: json({ name: 'Renamed', colour: '#ff8833' }),
    setup: ON_A_RAIL,
  },
  [`PATCH ${PLAN}/epics/{epicId}/placement`]: {
    path: `${EPIC_PATH}/placement`,
    headers: adminJson(),
    body: json({ railOrder: 0 }),
    setup: ON_A_RAIL,
  },
  [`DELETE ${PLAN}/epics/{epicId}`]: { path: EPIC_PATH, headers: admin(), setup: ON_A_RAIL },
  [`POST ${PLAN}/features`]: {
    path: `${FIRST_PLAN_PATH}/features`,
    headers: adminJson(),
    body: json({ epicId: FIRST_EPIC, name: 'Checkout page', estimateDays: 3 }),
    setup: ON_A_RAIL,
  },
  [`PATCH ${PLAN}/features/{featureId}`]: {
    path: FEATURE_PATH,
    headers: adminJson(),
    body: json({ name: 'Renamed', estimateDays: 5, pinSprint: 1 }),
    setup: ON_A_FEATURE,
  },
  [`PATCH ${PLAN}/features/{featureId}/placement`]: {
    path: `${FEATURE_PATH}/placement`,
    headers: adminJson(),
    body: json({ epicId: FIRST_EPIC, position: 0 }),
    setup: ON_A_FEATURE,
  },
  [`PUT ${PLAN}/features/{featureId}/dependencies`]: {
    path: `${FEATURE_PATH}/dependencies`,
    headers: adminJson(),
    body: json({ dependsOn: [] }),
    setup: ON_A_FEATURE,
  },
  [`DELETE ${PLAN}/features/{featureId}`]: {
    path: FEATURE_PATH,
    headers: admin(),
    setup: ON_A_FEATURE,
  },
  [`POST ${PLAN}/items`]: {
    path: `${FIRST_PLAN_PATH}/items`,
    headers: adminJson(),
    body: json({ featureId: FIRST_FEATURE, name: 'Basket totals', estimateDays: 3 }),
    setup: ON_A_FEATURE,
  },
  [`GET ${PLAN}/items/{itemId}`]: { path: ITEM_PATH, headers: admin(), setup: ON_AN_ITEM },
  [`PATCH ${PLAN}/items/{itemId}`]: {
    path: ITEM_PATH,
    headers: adminJson(),
    body: json({ name: 'Renamed', estimateDays: 2 }),
    setup: ON_AN_ITEM,
  },
  [`PATCH ${PLAN}/items/{itemId}/placement`]: {
    path: `${ITEM_PATH}/placement`,
    headers: adminJson(),
    body: json({ featureId: FIRST_FEATURE, position: 0 }),
    setup: ON_AN_ITEM,
  },
  [`PUT ${PLAN}/items/{itemId}/description`]: {
    path: `${ITEM_PATH}/description`,
    headers: adminJson(),
    body: json({ description: 'Sum the lines, then apply the discount.' }),
    setup: ON_AN_ITEM,
  },
  [`DELETE ${PLAN}/items/{itemId}`]: { path: ITEM_PATH, headers: admin(), setup: ON_AN_ITEM },
  [`GET ${PROJECT}`]: { path: P1, headers: admin() },
  [`PATCH ${PROJECT}`]: { path: P1, headers: adminJson(), body: json({ name: 'Renamed' }) },
  [`DELETE ${PROJECT}`]: { path: P1, headers: admin() },
  [`GET ${PROJECT}/export`]: { path: `${P1}/export`, headers: admin() },
  [`GET ${PROJECT}/folders`]: { path: `${P1}/folders`, headers: admin() },
  [`POST ${PROJECT}/folders`]: {
    path: `${P1}/folders`,
    headers: adminJson(),
    body: json({ name: 'Later' }),
  },
  [`POST ${PROJECT}/folders/reorder`]: {
    path: `${P1}/folders/reorder`,
    headers: adminJson(),
    body: json({ folderIds: [IDS.f2, IDS.f1] }),
  },
  [`PATCH ${PROJECT}/folders/{folderId}`]: {
    path: `${P1}/folders/${IDS.f1}`,
    headers: adminJson(),
    body: json({ name: 'Renamed' }),
  },
  [`DELETE ${PROJECT}/folders/{folderId}`]: { path: `${P1}/folders/${IDS.f1}`, headers: admin() },
  [`POST ${PROJECT}/tasks`]: {
    path: `${P1}/tasks`,
    headers: adminJson(),
    body: json({ name: 'Book the venue' }),
  },
  [`POST ${PROJECT}/tasks/reorder`]: {
    path: `${P1}/tasks/reorder`,
    headers: adminJson(),
    body: json({ folderId: null, taskIds: [IDS.t3, IDS.t2] }),
  },
  [`GET ${TASK}`]: { path: T1, headers: admin() },
  [`PATCH ${TASK}`]: { path: T1, headers: adminJson(), body: json({ name: 'Renamed' }) },
  [`DELETE ${TASK}`]: { path: T1, headers: admin() },
  [`POST ${TASK}/move`]: {
    path: `${T1}/move`,
    headers: adminJson(),
    body: json({ folderId: IDS.f2 }),
  },
  [`POST ${TASK}/tabs`]: { path: `${T1}/tabs`, headers: adminJson(), body: json({ name: 'Notes' }) },
  [`POST ${TASK}/tabs/reorder`]: {
    path: `${T1}/tabs/reorder`,
    headers: adminJson(),
    body: json({ tabIds: [IDS.tab1] }),
  },
  [`PATCH ${TASK}/tabs/{tabId}`]: {
    path: `${T1}/tabs/${IDS.tab1}`,
    headers: adminJson(),
    body: json({ name: 'Renamed' }),
  },
  [`DELETE ${TASK}/tabs/{tabId}`]: {
    path: `${T1}/tabs/${IDS.tab1}`,
    headers: admin(),
    setup: [
      {
        method: 'POST',
        path: `${T1}/tabs`,
        headers: adminJson(),
        body: json({ name: 'The one left behind' }),
      },
    ],
  },
  [`PUT ${TASK}/tabs/{tabId}/document`]: {
    path: `${T1}/tabs/${IDS.tab1}/document`,
    headers: { ...adminJson(), 'if-match': STAMP },
    body: json({ type: 'doc', content: [] }),
  },
  [`GET ${PROJECT}/share-links`]: { path: `${P1}/share-links`, headers: admin() },
  [`POST ${PROJECT}/share-links`]: {
    path: `${P1}/share-links`,
    headers: adminJson(),
    body: json({ name: 'Acme', role: 'view', scope: { kind: 'project', projectId: IDS.p1 } }),
  },
  [`PATCH ${PROJECT}/share-links/{token}`]: {
    path: `${P1}/share-links/${TOKENS.p1View}`,
    headers: adminJson(),
    body: json({ name: 'Jane at ACME', role: 'view' }),
  },
  [`DELETE ${PROJECT}/share-links/{token}`]: {
    path: `${P1}/share-links/${TOKENS.p1View}`,
    headers: admin(),
  },
}

const byComponentId = (): Map<string, z.ZodType> => {
  const found = new Map<string, z.ZodType>()
  for (const schema of Object.values(contracts)) {
    if (!(schema instanceof z.ZodType)) continue
    const id = schema.meta()?.id
    if (typeof id === 'string') found.set(id, schema)
  }
  return found
}

interface Operation {
  readonly responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>
}

interface Described {
  readonly key: string
  readonly method: string
  readonly status: number
  readonly component: string | null
}

const success = (operation: Operation): [string, { $ref?: string } | undefined] | undefined =>
  Object.entries(operation.responses ?? {})
    .filter(([status]) => status.startsWith('2'))
    .map(([status, response]): [string, { $ref?: string } | undefined] => [
      status,
      response.content?.['application/json']?.schema,
    ])[0]

const described = async (): Promise<Described[]> => {
  const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
  return Object.entries(paths)
    .filter(([path]) => path.startsWith('/v1'))
    .flatMap(([path, item]) =>
      Object.entries(item as Record<string, Operation>).flatMap(([method, operation]) => {
        const found = success(operation)
        if (found === undefined) return []
        return [
          {
            key: `${method.toUpperCase()} ${path}`,
            method: method.toUpperCase(),
            status: Number(found[0]),
            component: found[1]?.$ref?.replace('#/components/schemas/', '') ?? null,
          },
        ]
      }),
    )
}

const issue = async (app: Awaited<ReturnType<typeof buildApp>>, step: Step): Promise<Response> => {
  const { method, path, headers } = step
  if (step.body === undefined) return app.request(path, { method, headers })
  return app.request(path, { method, headers, body: step.body })
}

const send = async (sample: Sample, method: string): Promise<Response> => {
  const app = await buildApp()
  for (const step of sample.setup ?? []) {
    const prepared = await issue(app, step)
    expect([step.path, prepared.status < 300]).toEqual([step.path, true])
  }
  const { path, headers } = sample
  const step: Step =
    sample.body === undefined ? { method, path, headers } : { method, path, headers, body: sample.body }
  return issue(app, step)
}

const keysOf = (value: unknown): string[] =>
  value !== null && typeof value === 'object' ? Object.keys(value).sort() : []

describe('guard (4): a real response parses against the schema its route declares', () => {
  it('documents nothing outside /v1 but the health probe, so the walk cannot miss a route', async () => {
    const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
    expect(Object.keys(paths).filter((path) => !path.startsWith('/v1'))).toEqual(['/healthz'])
  })

  it('takes every success body from a component rather than an inline shape beside the handler', async () => {
    const inline = (await described())
      .filter((one) => one.component === null && one.status !== 204)
      .map((one) => one.key)
    expect(inline).toEqual([])
  })

  it('resolves every component it names against @repo/contracts', async () => {
    const known = byComponentId()
    const unresolved = (await described())
      .filter((one) => one.component !== null && !known.has(one.component))
      .map((one) => `${one.key} -> ${String(one.component)}`)
    expect(unresolved).toEqual([])
  })

  it('has a sample request for every operation, so a new route cannot opt out of the walk', async () => {
    const missing = (await described())
      .filter((one) => SAMPLES[one.key] === undefined)
      .map((one) => one.key)
    expect(missing).toEqual([])
  })

  it('covers every operation under /v1, and there are more than twenty of them', async () => {
    const walked = await described()
    expect(walked.length).toBe(Object.keys(SAMPLES).length)
    expect(walked.length).toBeGreaterThan(20)
  })

  it('answers each one with the status it declares, and parses the body against its schema', async () => {
    const known = byComponentId()
    const failures: string[] = []
    for (const one of await described()) {
      const sample = SAMPLES[one.key]
      if (sample === undefined) continue
      const response = await send(sample, one.method)
      if (response.status !== one.status) {
        failures.push(`${one.key} answered ${response.status}, not the ${one.status} it declares`)
        continue
      }
      if (one.component === null) {
        if ((await response.text()) !== '') failures.push(`${one.key} sent a body it does not declare`)
        continue
      }
      const schema = known.get(one.component)
      if (schema === undefined) continue
      const received: unknown = await response.json()
      const parsed = schema.safeParse(received)
      if (!parsed.success) {
        failures.push(`${one.key} does not satisfy ${one.component}: ${parsed.error.message}`)
      } else if (JSON.stringify(keysOf(received)) !== JSON.stringify(keysOf(parsed.data))) {
        failures.push(`${one.key}: ${one.component} does not describe ${keysOf(received).join(', ')}`)
      }
    }
    expect(failures).toEqual([])
  })
})
