import * as contracts from '@repo/contracts'
import { STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
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

const PROJECT = `${GUARDED_PREFIX}/projects/{projectId}`
const TASK = `${PROJECT}/tasks/{taskId}`
const P1 = `${GUARDED_PREFIX}/projects/${IDS.p1}`
const T1 = `${P1}/tasks/${IDS.t1}`

interface Step {
  readonly method: string
  readonly path: string
  readonly headers: Record<string, string>
  readonly body?: string
}

interface Sample {
  readonly path: string
  readonly headers: Record<string, string>
  readonly body?: string
  readonly setup?: Step
}

const json = (value: unknown): string => JSON.stringify(value)

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
  [`GET ${GUARDED_PREFIX}/shares/current`]: {
    path: `${GUARDED_PREFIX}/shares/current`,
    headers: asLink(TOKENS.p1View),
  },
  [`GET ${PROJECT}`]: { path: P1, headers: admin() },
  [`PATCH ${PROJECT}`]: { path: P1, headers: adminJson(), body: json({ name: 'Renamed' }) },
  [`DELETE ${PROJECT}`]: { path: P1, headers: admin() },
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
    setup: {
      method: 'POST',
      path: `${T1}/tabs`,
      headers: adminJson(),
      body: json({ name: 'The one left behind' }),
    },
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
  [`DELETE ${PROJECT}/share-links/{token}`]: {
    path: `${P1}/share-links/${TOKENS.p1View}`,
    headers: admin(),
  },
}

const byComponentId = (): Map<string, z.ZodType> => {
  const found = new Map<string, z.ZodType>()
  for (const schema of Object.values(contracts)) {
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
  if (sample.setup !== undefined) {
    const prepared = await issue(app, sample.setup)
    expect([sample.setup.path, prepared.status < 300]).toEqual([sample.setup.path, true])
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
