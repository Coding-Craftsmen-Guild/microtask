import { describe, expect, it } from 'vitest'
import { ItemView, MAX_ITEM_DESCRIPTION_BYTES, PlanView } from '@repo/contracts'
import { IDS, admin, adminJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const ITEMS = `${ONE}/items`
const FIXTURE_ITEMS: readonly string[] = [
  PLAN_IDS.i1,
  PLAN_IDS.i2,
  PLAN_IDS.i3,
  PLAN_IDS.i4,
  PLAN_IDS.i5,
  PLAN_IDS.i6,
  PLAN_IDS.i7,
  PLAN_IDS.i8,
  PLAN_IDS.i9,
]

const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()

/** One astral code point, built from its number so no escape sequence has to survive a tool. */
const GRIN = String.fromCodePoint(0x1f600)

const byteLength = (value: string): number => ENCODER.encode(value).length

const survivesUtf8 = (value: string): boolean => DECODER.decode(ENCODER.encode(value)) === value

const hasLoneSurrogate = (value: string): boolean =>
  [...value].some(
    (point) =>
      point.length === 1 && point.charCodeAt(0) >= 0xd800 && point.charCodeAt(0) <= 0xdfff,
  )

interface Span {
  readonly id: string
  readonly startDay: number
  readonly endDay: number
}

const spanOf = (found: Record<string, unknown>, id: string): Span | undefined =>
  (found['schedule'] as { spans: Span[] }).spans.find((one) => one.id === id)

const itemsOf = (
  found: Record<string, unknown>,
): { id: string; featureId: string; position: number; estimateDays: number | null }[] =>
  found['items'] as {
    id: string
    featureId: string
    position: number
    estimateDays: number | null
  }[]

const post = async (
  app: Awaited<ReturnType<typeof buildMacroplanApp>>,
  payload: unknown,
): Promise<Response> =>
  app.request(ITEMS, { method: 'POST', headers: adminJson(), body: JSON.stringify(payload) })

const describeItem = async (
  app: Awaited<ReturnType<typeof buildMacroplanApp>>,
  itemId: string,
  description: string,
): Promise<Response> =>
  app.request(`${ITEMS}/${itemId}/description`, {
    method: 'PUT',
    headers: adminJson(),
    body: JSON.stringify({ description }),
  })

const readItem = async (
  app: Awaited<ReturnType<typeof buildMacroplanApp>>,
  itemId: string,
): Promise<Record<string, unknown>> => body(await app.request(`${ITEMS}/${itemId}`, { headers: admin() }))

describe('POST /v1/macroplan/plans/{planId}/items', () => {
  const added = async (): Promise<Record<string, unknown>> =>
    body(
      await post(await buildMacroplanApp(), {
        featureId: PLAN_IDS.f1,
        name: 'Basket VAT',
        estimateDays: 2,
      }),
    )

  it('answers 200 and a body the contract recognises as a PlanView', async () => {
    const app = await buildMacroplanApp()
    const response = await post(app, { featureId: PLAN_IDS.f1, name: 'Basket VAT' })
    expect(response.status).toBe(200)
    const parsed = PlanView.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('appends the item after the last one in its feature', async () => {
    const found = await added()
    const one = itemsOf(found).find((each) => !FIXTURE_ITEMS.includes(each.id))
    expect(one).toMatchObject({ featureId: PLAN_IDS.f1, position: 2, estimateDays: 2 })
  })

  it("grows its feature's span by exactly that item's estimate", async () => {
    const found = await added()
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 6 })
  })

  it('lays the new item end to end after its siblings, which is contiguity on the wire', async () => {
    const found = await added()
    const one = itemsOf(found).find((each) => !FIXTURE_ITEMS.includes(each.id))
    expect(spanOf(found, PLAN_IDS.i1)).toEqual({ id: PLAN_IDS.i1, startDay: 0, endDay: 1 })
    expect(spanOf(found, PLAN_IDS.i2)).toEqual({ id: PLAN_IDS.i2, startDay: 1, endDay: 4 })
    expect(spanOf(found, one?.id ?? '')).toEqual({ id: one?.id, startDay: 4, endDay: 6 })
  })

  it('pushes everything that waited on that feature, across rails as well as along one', async () => {
    const found = await added()
    expect(spanOf(found, PLAN_IDS.f2)).toEqual({ id: PLAN_IDS.f2, startDay: 6, endDay: 9 })
    expect(spanOf(found, PLAN_IDS.f3)).toEqual({ id: PLAN_IDS.f3, startDay: 6, endDay: 9 })
  })

  it('refuses a feature that is not in this plan with a 422, a featureId being a body field', async () => {
    const response = await post(await buildMacroplanApp(), {
      featureId: PLAN_IDS.missing,
      name: 'Nowhere',
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid' })
  })
})

describe('GET /v1/macroplan/plans/{planId}/items/{itemId}', () => {
  it('answers the item beside the description its own file holds', async () => {
    const found = await readItem(await buildMacroplanApp(), PLAN_IDS.i1)
    expect(found).toMatchObject({
      id: PLAN_IDS.i1,
      featureId: PLAN_IDS.f1,
      description: 'Wire the form to the API',
      linkedTaskId: null,
    })
    expect(ItemView.safeParse(found).success).toBe(true)
  })

  it('answers an empty description for an item that has no file yet, rather than 404', async () => {
    const app = await buildMacroplanApp()
    const created = await body(await post(app, { featureId: PLAN_IDS.f1, name: 'Undescribed' }))
    const one = itemsOf(created).find((each) => !FIXTURE_ITEMS.includes(each.id))
    expect(await readItem(app, one?.id ?? '')).toMatchObject({ description: '' })
  })

  it('answers 404 for a well-formed item id that belongs to nothing, and 422 for junk', async () => {
    const app = await buildMacroplanApp()
    const missing = await app.request(`${ITEMS}/${PLAN_IDS.missing}`, { headers: admin() })
    const junk = await app.request(`${ITEMS}/not-a-ulid`, { headers: admin() })
    expect([missing.status, junk.status]).toEqual([404, 422])
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/items/{itemId}', () => {
  const patch = async (
    app: Awaited<ReturnType<typeof buildMacroplanApp>>,
    itemId: string,
    payload: unknown,
  ): Promise<Response> =>
    app.request(`${ITEMS}/${itemId}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify(payload),
    })

  it('renames an item and moves nothing', async () => {
    const found = await body(await patch(await buildMacroplanApp(), PLAN_IDS.i1, { name: 'Add' }))
    expect(itemsOf(found).find((one) => one.id === PLAN_IDS.i1)).toMatchObject({
      featureId: PLAN_IDS.f1,
      position: 0,
    })
  })

  it("clears an estimate with null and shrinks its feature's span to what is left", async () => {
    const found = await body(
      await patch(await buildMacroplanApp(), PLAN_IDS.i2, { estimateDays: null }),
    )
    expect(itemsOf(found).find((one) => one.id === PLAN_IDS.i2)?.estimateDays).toBeNull()
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 1 })
    expect(spanOf(found, PLAN_IDS.i2)).toBeUndefined()
  })

  it('refuses an empty body with a 422', async () => {
    const response = await patch(await buildMacroplanApp(), PLAN_IDS.i1, {})
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })
})

describe('the task link a PATCH may not write, which phase 4 owns (spec §9)', () => {
  it('ignores a linkedTaskId in the body and leaves the stored one null', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(`${ITEMS}/${PLAN_IDS.i1}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({ name: 'Add to basket', linkedTaskId: IDS.t1 }),
    })
    expect(response.status).toBe(200)
    const stored = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
    expect(stored?.items.find((one) => one.id === PLAN_IDS.i1)?.linkedTaskId).toBeNull()
  })

  it('answers no link either, the key being stripped before the handler runs', async () => {
    const app = await buildMacroplanApp()
    await app.request(`${ITEMS}/${PLAN_IDS.i1}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({ name: 'Add to basket', linkedTaskId: IDS.t1 }),
    })
    expect(await readItem(app, PLAN_IDS.i1)).toMatchObject({ linkedTaskId: null })
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/items/{itemId}/placement', () => {
  const place = async (itemId: string, to: unknown): Promise<Record<string, unknown>> =>
    body(
      await (await buildMacroplanApp()).request(`${ITEMS}/${itemId}/placement`, {
        method: 'PATCH',
        headers: adminJson(),
        body: JSON.stringify(to),
      }),
    )

  it('moves an item under another feature and renumbers both groups densely', async () => {
    const found = await place(PLAN_IDS.i7, { featureId: PLAN_IDS.f6, position: 0 })
    const moved = itemsOf(found).filter((one) => [PLAN_IDS.f5, PLAN_IDS.f6].includes(one.featureId))
    expect(moved.map((one) => [one.id, one.featureId, one.position])).toEqual([
      [PLAN_IDS.i5, PLAN_IDS.f5, 0],
      [PLAN_IDS.i6, PLAN_IDS.f5, 1],
      [PLAN_IDS.i7, PLAN_IDS.f6, 0],
      [PLAN_IDS.i8, PLAN_IDS.f6, 1],
      [PLAN_IDS.i9, PLAN_IDS.f6, 2],
    ])
  })

  it('re-sizes both features, because a feature is worth the sum of its estimated items', async () => {
    const found = await place(PLAN_IDS.i7, { featureId: PLAN_IDS.f6, position: 0 })
    expect(spanOf(found, PLAN_IDS.f5)).toEqual({ id: PLAN_IDS.f5, startDay: 0, endDay: 5 })
    expect(spanOf(found, PLAN_IDS.f6)).toEqual({ id: PLAN_IDS.f6, startDay: 5, endDay: 14 })
    expect(spanOf(found, PLAN_IDS.i7)).toEqual({ id: PLAN_IDS.i7, startDay: 5, endDay: 9 })
  })

  it('refuses a feature that is not in this plan with a 422', async () => {
    const response = await (await buildMacroplanApp()).request(
      `${ITEMS}/${PLAN_IDS.i1}/placement`,
      {
        method: 'PATCH',
        headers: adminJson(),
        body: JSON.stringify({ featureId: PLAN_IDS.missing, position: 0 }),
      },
    )
    expect(response.status).toBe(422)
  })
})

describe('PUT /v1/macroplan/plans/{planId}/items/{itemId}/description', () => {
  it('stores the text and answers the plan, like every other write in this subtree', async () => {
    const app = await buildMacroplanApp()
    const response = await describeItem(app, PLAN_IDS.i1, 'Sum the lines.')
    expect(response.status).toBe(200)
    expect(PlanView.safeParse(await response.json()).success).toBe(true)
    expect(await readItem(app, PLAN_IDS.i1)).toMatchObject({ description: 'Sum the lines.' })
  })

  it('writes the file through the store, not only into the response', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await describeItem(app, PLAN_IDS.i1, 'Sum the lines.')
    const file = await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i1)
    expect(file?.description).toBe('Sum the lines.')
  })
})

describe('the description byte cap, which is UTF-8 bytes and not UTF-16 units', () => {
  const ASTRAL = `${GRIN.repeat(2048)}${'a'.repeat(808)}`
  const STRADDLING = `${'a'.repeat(8191)}${GRIN.repeat(202)}a`

  const stored = async (sent: string): Promise<string> => {
    const app = await buildMacroplanApp()
    await describeItem(app, PLAN_IDS.i1, sent)
    return String((await readItem(app, PLAN_IDS.i1))['description'])
  }

  it('sends 9,000 bytes in each case, so the cap is what does the cutting', () => {
    expect([byteLength(ASTRAL), byteLength(STRADDLING)]).toEqual([9000, 9000])
    expect(MAX_ITEM_DESCRIPTION_BYTES).toBe(8192)
  })

  it('keeps exactly 8,192 bytes when the cap lands on a code-point boundary', async () => {
    const kept = await stored(ASTRAL)
    expect(byteLength(kept)).toBe(MAX_ITEM_DESCRIPTION_BYTES)
    expect(kept).toBe(GRIN.repeat(2048))
    expect([...kept]).toHaveLength(2048)
  })

  it('returns it with no lone surrogate, which is what re-encoding proves', async () => {
    const kept = await stored(ASTRAL)
    expect(hasLoneSurrogate(kept)).toBe(false)
    expect(survivesUtf8(kept)).toBe(true)
  })

  it('drops a code point whole rather than cutting one in half at the boundary', async () => {
    const kept = await stored(STRADDLING)
    expect(kept).toBe('a'.repeat(8191))
    expect(byteLength(kept)).toBe(MAX_ITEM_DESCRIPTION_BYTES - 1)
    expect(hasLoneSurrogate(kept)).toBe(false)
    expect(survivesUtf8(kept)).toBe(true)
  })
})

describe('DELETE /v1/macroplan/plans/{planId}/items/{itemId}', () => {
  const remove = async (
    app: Awaited<ReturnType<typeof buildMacroplanApp>>,
    itemId: string,
  ): Promise<Response> => app.request(`${ITEMS}/${itemId}`, { method: 'DELETE', headers: admin() })

  it("answers 200 and shrinks its feature's span by exactly that item's estimate", async () => {
    const response = await remove(await buildMacroplanApp(), PLAN_IDS.i2)
    expect(response.status).toBe(200)
    const found = await body(response)
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 1 })
    expect(spanOf(found, PLAN_IDS.i2)).toBeUndefined()
  })

  it('renumbers what is left of its group densely and pulls the rest of the plan back', async () => {
    const found = await body(await remove(await buildMacroplanApp(), PLAN_IDS.i1))
    expect(itemsOf(found).find((one) => one.id === PLAN_IDS.i2)?.position).toBe(0)
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 3 })
    expect(spanOf(found, PLAN_IDS.f3)).toEqual({ id: PLAN_IDS.f3, startDay: 3, endDay: 6 })
  })

  it('takes the item file off the store with it', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await remove(app, PLAN_IDS.i2)
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i2)).toBeNull()
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i1)).not.toBeNull()
  })

  it('answers 404 for a well-formed item id that belongs to nothing, and 422 for junk', async () => {
    const app = await buildMacroplanApp()
    const missing = await remove(app, PLAN_IDS.missing)
    const junk = await remove(app, 'not-a-ulid')
    expect([missing.status, junk.status]).toEqual([404, 422])
  })
})
