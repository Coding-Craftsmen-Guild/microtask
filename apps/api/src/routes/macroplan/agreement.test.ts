import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EpicBinding,
  PROBLEM_CODES,
  Problem,
  UpdateEpicPayload,
  UpdateItemPayload,
  ValidationProblem,
} from '@repo/contracts'
import { ACTIONS } from '@repo/kernel'
import type { PlanManifest } from '@repo/macroplan-domain'
import { schedule, type ScheduleResult } from '@repo/schedule'
import { IDS, admin, adminJson, body, linkJson } from '../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanApp,
  buildMacroplanFixture,
  type MacroplanFixture,
} from '../../testing/macroplan-harness.js'

/**
 * The four claims no single-package suite can make, because each one spans two packages or the
 * whole route tree.
 *
 * Every other macroplan suite asks one route one question. These four ask whether two things that
 * were written separately still say the same thing: the scheduler and the wire, the handler tree and
 * the gate, the published code set and the statuses the routes actually answer, and the pending
 * authorization rows and the payloads that keep them pending. A suite living inside one package
 * cannot see either side of any of those.
 */
const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`

type App = Awaited<ReturnType<typeof buildMacroplanApp>>

/** One bar on the axis as JSON carries it, which is an array entry and not a `Map` key. */
interface WireSpan {
  readonly id: string
  readonly startDay: number
  readonly endDay: number
}

/** The `schedule` block of a plan response, read back as loosely as a test should read it. */
interface WireSchedule {
  readonly spans: readonly WireSpan[]
  readonly cycles: readonly unknown[]
  readonly unscheduled: readonly unknown[]
  readonly ignoredEdges: readonly unknown[]
}

const byText = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const bySpan = (left: WireSpan, right: WireSpan): number =>
  left.startDay - right.startDay || byText(left.id, right.id)

/**
 * The flattening the wire performs, restated here rather than imported.
 *
 * Restating it is the whole point. `planSchedule` in `@repo/macroplan-domain` is the function the
 * route already calls, so importing it would compare a value to itself and this file could not fail;
 * importing `schedule` from `@repo/schedule` and flattening here means the order below is this
 * test's own independent claim about what a client receives. `days` is a `Map<string, Span>` that
 * does not survive `JSON.stringify`, so it becomes an array sorted by `(startDay, id)`; `unscheduled`
 * sorts by id; `cycles` and `ignoredEdges` pass through as the pass produced them.
 */
const flatten = (result: ScheduleResult): WireSchedule => ({
  spans: [...result.days]
    .map(([id, span]) => ({ id, startDay: span.startDay, endDay: span.endDay }))
    .sort(bySpan),
  cycles: result.cycles,
  unscheduled: [...result.unscheduled].sort((left, right) => byText(left.id, right.id)),
  ignoredEdges: result.ignoredEdges,
})

const scheduleOf = (found: Record<string, unknown>): WireSchedule => found['schedule'] as WireSchedule

/** The fixture plan as the store holds it, which is the input the route's own pass is given. */
const storedPlan = async (fixture: MacroplanFixture): Promise<PlanManifest> => {
  const found = await fixture.deps.plans.readManifest('macroplan', PLAN_IDS.plan)
  if (found === null) throw new Error('the fixture plan is missing from the store')
  return found
}

const readPlan = async (fixture: MacroplanFixture): Promise<WireSchedule> =>
  scheduleOf(await body(await fixture.app.request(ONE, { headers: admin() })))

/**
 * Two implementations of the forward pass would disagree, and this is what catches one appearing.
 *
 * Spec §4.1's whole argument for a shared scheduling package is that the day a second forward pass
 * exists — one in the API, one in the app, one written to "just tweak" an offset — the two will
 * drift and nobody will notice, because each one's own unit tests keep passing. So this compares the
 * `schedule` block the route answered against a pass **this test ran itself**, from the package, over
 * the manifest read straight out of the store the route reads.
 */
describe('the schedule on the wire is the schedule @repo/schedule computes (spec §4.1)', () => {
  it('agrees block for block with a forward pass this test runs from @repo/schedule itself', async () => {
    const fixture = await buildMacroplanFixture()
    const expected = flatten(schedule(await storedPlan(fixture)))
    expect(await readPlan(fixture)).toEqual(expected)
  })

  it('compares a timeline with every feature and item on it, not two empty blocks', async () => {
    const fixture = await buildMacroplanFixture()
    const plan = await storedPlan(fixture)
    const found = await readPlan(fixture)
    expect(found.spans).toHaveLength(plan.features.length + plan.items.length)
    expect(found.spans.length).toBeGreaterThan(0)
  })

  it('still agrees once a route has moved something, so it is the pass and not the fixture', async () => {
    const fixture = await buildMacroplanFixture()
    const response = await fixture.app.request(`${ONE}/features/${PLAN_IDS.f5}/dependencies`, {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ dependsOn: [PLAN_IDS.f2] }),
    })
    expect(response.status).toBe(200)
    const answered = scheduleOf(await body(response))
    expect(answered.spans).toContainEqual({ id: PLAN_IDS.f5, startDay: 7, endDay: 16 })
    expect(answered).toEqual(flatten(schedule(await storedPlan(fixture))))
  })

  it('carries the spans in ascending (startDay, id) order, which a Map cannot promise', async () => {
    const found = await readPlan(await buildMacroplanFixture())
    expect(found.spans).toEqual([...found.spans].sort(bySpan))
  })

  it('sorts rather than passing the map through, the pass own order being a traversal detail', async () => {
    const plan = await storedPlan(await buildMacroplanFixture())
    const traversed = [...schedule(plan).days].map(([id]) => id)
    expect(traversed).not.toEqual(flatten(schedule(plan)).spans.map((one) => one.id))
  })
})

const HERE = dirname(fileURLToPath(import.meta.url))

const filesNamed = (directory: string, name: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return filesNamed(full, name)
    return entry.isFile() && entry.name === name ? [full] : []
  })

/** One exported handler: where it lives, what it is called, and its own source down to the next. */
interface Handler {
  readonly directory: string
  readonly name: string
  readonly source: string
}

const OPENS = /^export const (\w+) =/gmu

const handlersIn = (file: string): readonly Handler[] => {
  const source = readFileSync(file, 'utf8')
  const opens = [...source.matchAll(OPENS)]
  return opens.map((open, index) => ({
    directory: dirname(file),
    name: open[1] ?? '?',
    source: source.slice(open.index ?? 0, opens[index + 1]?.index ?? source.length),
  }))
}

const handlers = (): readonly Handler[] => filesNamed(HERE, 'handlers.ts').flatMap(handlersIn)

const gatesIn = (handler: Handler): number => [...handler.source.matchAll(/authorize\(/gu)].length

/**
 * Every macroplan handler calls the gate at least once, which is all that can be asserted.
 *
 * Not "the call count equals the handler count", although `authorize`'s own TSDoc still says that:
 * three handlers choose their action from the body, because a retime is a different grant from a
 * rename (ADR 0011), and each of those spends three `authorize` calls on two branches and a
 * follow-up. A count equality would therefore have to be a magic number, and a magic number
 * changes for the wrong reasons — a fourth branching handler and a newly unguarded one move it the
 * same way.
 *
 * `authorize` throws rather than returning a boolean precisely so that *not calling it* is the only
 * way left to be unguarded: a handler that ignored a returned `false` would still answer 200, but a
 * handler with no call in it at all is greppable. So the claim below is exactly that — no handler's
 * own block is free of one.
 *
 * The anchor against a broken pattern is a **derived** one rather than a pinned total: every
 * directory under this tree that declares routes must also have yielded at least one handler. That
 * survives a route being added — the new directory brings its own row — and it fails on the two
 * things a pinned number cannot tell apart: a regex that matches nothing (every directory goes
 * missing at once) and a `handlers.ts` that stops being scanned (its own directory goes missing,
 * and every one of its ungated handlers would otherwise have vanished from the census with it).
 * The floor beneath it is only there so an empty tree cannot satisfy an empty subtraction.
 */
describe('every macroplan handler is gated, because authorize throws rather than answering', () => {
  it('leaves no handler without an authorize call in its own block', () => {
    expect(handlers().filter((one) => gatesIn(one) === 0).map((one) => one.name)).toEqual([])
  })

  it('finds a handler in every directory that declares routes, so no file went unscanned', () => {
    const scanned = new Set(handlers().map((one) => one.directory))
    const declaring = filesNamed(HERE, 'routes.ts').map((file) => dirname(file))
    expect(declaring.filter((directory) => !scanned.has(directory))).toEqual([])
    expect(declaring.length).toBeGreaterThan(4)
  })

  it('finds well over twenty handlers, so an empty scan cannot satisfy the two above', () => {
    expect(handlers().length).toBeGreaterThan(20)
  })

  it('names the handlers that gate more than once, which are the ones choosing on the body', () => {
    const branching = handlers().filter((one) => gatesIn(one) > 1).map((one) => one.name)
    expect([...branching].sort()).toEqual(['updateFeature', 'updateItem', 'updatePlan'])
  })
})

type Shape = 'problem' | 'validation'

/** One refusal these routes really produce, and the published shape and code it must arrive as. */
interface Refusal {
  readonly status: number
  readonly code: string
  readonly shape: Shape
  readonly what: string

  /**
   * `Response | Promise<Response>` because that is what `app.request` is declared to return, and a
   * `Promise<Response>` annotation here would be narrowing Hono's own signature rather than using it.
   * The call site awaits, which accepts either.
   */
  readonly send: (app: App) => Response | Promise<Response>
}

const REFUSALS: readonly Refusal[] = [
  {
    status: 401,
    code: 'unknown_service',
    shape: 'problem',
    what: 'a request carrying no credential at all',
    send: (app) => app.request(`${MACROPLAN_PREFIX}/plans`),
  },
  {
    status: 403,
    code: 'forbidden',
    shape: 'problem',
    what: 'a view seat retiming the plan it may only read',
    send: (app) =>
      app.request(ONE, {
        method: 'PATCH',
        headers: linkJson(PLAN_TOKENS.view),
        body: JSON.stringify({ startDate: '2026-02-02' }),
      }),
  },
  {
    status: 404,
    code: 'not_found',
    shape: 'problem',
    what: 'a well-formed plan id that belongs to nothing',
    send: (app) =>
      app.request(`${MACROPLAN_PREFIX}/plans/${PLAN_IDS.missing}`, { headers: admin() }),
  },
  {
    status: 409,
    code: 'conflict',
    shape: 'problem',
    what: 'a dependency edge that would close a cycle',
    send: (app) =>
      app.request(`${ONE}/features/${PLAN_IDS.f1}/dependencies`, {
        method: 'PUT',
        headers: adminJson(),
        body: JSON.stringify({ dependsOn: [PLAN_IDS.f3] }),
      }),
  },
  {
    status: 422,
    code: 'invalid',
    shape: 'validation',
    what: 'a plan id that is not a ULID',
    send: (app) => app.request(`${MACROPLAN_PREFIX}/plans/not-a-ulid`, { headers: admin() }),
  },
]

/** What the published shape made of the body: whether it parsed, and what it objected to. */
interface Parsed {
  readonly ok: boolean
  readonly issues: readonly unknown[]
}

const against = (shape: Shape, value: unknown): Parsed => {
  const parsed = shape === 'validation' ? ValidationProblem.safeParse(value) : Problem.safeParse(value)
  return { ok: parsed.success, issues: parsed.error?.issues ?? [] }
}

/**
 * The published code set still covers these routes — asked of the responses, not of the table.
 *
 * `http/problem-codes.test.ts` already makes the census both ways over `MEANINGS`, `UNMAPPED` and
 * `CREDENTIAL_REFUSALS`, and because that census is status-based it covers these routes already.
 * What it cannot see is a route answering a status the table has no row for: subtracting two lists
 * that were both written from the table agrees with itself whatever the routes do. A response can
 * see it, so these drive five real failures out of macroplan paths and read the code off each one.
 *
 * All five are failures an existing macroplan suite already provokes, found rather than invented:
 * the 401 is `guard.test.ts`'s credential-less request, the 403 is the view seat `guard.test.ts`
 * refuses on PATCH, the 404 and the 422 are `plans.test.ts`'s missing id and non-ULID id, and the
 * 409 is the cycle-closing edge `features/dependencies.test.ts` pins. Using failures that are
 * already asserted elsewhere is deliberate: it means a change that moves one of those statuses
 * fails there first, naming the route, and fails here second, naming the contract.
 */
describe('every status these routes answer arrives under a published code (ADR 0036)', () => {
  const published: readonly string[] = PROBLEM_CODES

  for (const refusal of REFUSALS) {
    it(`reports ${String(refusal.status)} for ${refusal.what} under a published code`, async () => {
      const response = await refusal.send(await buildMacroplanApp())
      expect(response.status).toBe(refusal.status)
      const found = await body(response)
      const parsed = against(refusal.shape, found)
      expect(parsed.issues).toEqual([])
      expect(parsed.ok).toBe(true)
      expect(published).toContain(found['code'])
      expect(found['code']).toBe(refusal.code)
      expect(found['status']).toBe(refusal.status)
    })
  }

  it('drives five distinct statuses, so this is not one case written five times', () => {
    const statuses = [...new Set(REFUSALS.map((one) => one.status))].sort((left, right) => left - right)
    expect(statuses).toEqual([401, 403, 404, 409, 422])
  })
})

/**
 * The two rows `authorize-targets.test.ts` still allows are pending for a reason, and this is it.
 *
 * That file holds `PENDING_ROUTES` — `epic:bind` and `item:link`, the two actions the kernel declares
 * that no phase-1 route gates — and asserting its contents against a literal beside it would be a
 * line comparing a constant to itself, which goes on passing long after the guard it was meant to
 * protect is gone. What actually *keeps* each row pending is that no phase-1 body can write the field
 * its action would authorize: `UpdateEpicPayload` declares no `binding` and `UpdateItemPayload` no
 * `linkedTaskId`, so zod strips either before a handler sees it and there is nothing for a gate to
 * stand in front of.
 *
 * Asserted by parsing rather than by reading `.shape`, because stripping is what protects the field.
 * Both payloads are `z.object({...}).refine(...)`, and on zod 4.6 a refined object's `.omit()`,
 * `.pick()`, `.partial()` and `.merge()` typecheck and then throw at runtime, so a structural
 * assertion here would be reaching for exactly the wrong half of that object anyway.
 *
 * These fail the day somebody adds either field, which is the day the row must come out of
 * `PENDING_ROUTES`. That file asserts the other half — that no pending row has since been gated —
 * so between the two an allowance can neither outlive its debt nor hide a hole.
 */
describe('epic:bind and item:link stay pending because no phase-1 body can write their field', () => {
  const binding = EpicBinding.parse({
    projectId: IDS.p1,
    role: 'manage',
    sealedToken: 'a sealed token, long enough to be real',
  })

  it('strips a well-formed binding off an epic body, so epic:bind has no route to gate', () => {
    const parsed = UpdateEpicPayload.parse({ name: 'Checkout', binding })
    expect(Object.keys(parsed)).not.toContain('binding')
    expect(parsed).toEqual({ name: 'Checkout' })
  })

  it('strips a linkedTaskId off an item body, so item:link has no route to gate', () => {
    const parsed = UpdateItemPayload.parse({ name: 'Add to basket', linkedTaskId: IDS.t1 })
    expect(Object.keys(parsed)).not.toContain('linkedTaskId')
    expect(parsed).toEqual({ name: 'Add to basket' })
  })

  it('refuses a body that is nothing but the smuggled field, having stripped it to empty', () => {
    expect(UpdateEpicPayload.safeParse({ binding }).success).toBe(false)
    expect(UpdateItemPayload.safeParse({ linkedTaskId: IDS.t1 }).success).toBe(false)
  })

  it('finds both actions still declared by the kernel, which is what the allowance is about', () => {
    const pending = ['epic:bind', 'item:link'] as const
    expect(pending.filter((action) => !ACTIONS.includes(action))).toEqual([])
  })
})
