import { createMacroplanAdminClient, type MacroplanSessionClient } from '@repo/api-client'
import { problemAnswer } from '../../components/plan/testing/fake-plan-api'
import { ADMIN_TOKEN, atlasPlan, type StoredPlan } from '../../components/plan/testing/plan-fixture'

/** One request an action sent, as the wire carried it. */
export interface Sent {
  /** The HTTP method, as the transport spelled it. */
  readonly method: string

  /** The path below the base URL, with no query string. */
  readonly path: string

  /** The bearer this request presented, or `undefined` when it presented none. */
  readonly bearer: string | undefined

  /** The parsed request body, or `undefined` when there was none. */
  readonly body: unknown
}

/** One request without the credential it carried. */
export type Wire = Omit<Sent, 'bearer'>

/**
 * Every request as method, path and body, for an assertion the credential is not the subject of.
 *
 * Leaving the bearer out of those assertions does not leave it unchecked: {@link recordingAdmin}
 * answers 401 to any bearer but the admin's, so a wrongly wired action never reaches the comparison.
 */
export const wireOf = (sent: readonly Sent[]): readonly Wire[] =>
  sent.map(({ method, path, body }) => ({ method, path, body }))

/**
 * A {@link RecordingAdmin.refuse} predicate matching every request whose body **carries** `field`.
 *
 * On the key being present and never on `JSON.stringify(body).includes(field)`, which matches a
 * field's *value* too: `renameEpic(planId, epicId, 'colour scheme')` sends `{ name: 'colour
 * scheme' }`, and a matcher meant for the colour field would refuse that rename.
 */
export const carries =
  (field: string) =>
  (sent: Sent): boolean =>
    typeof sent.body === 'object' && sent.body !== null && field in sent.body

/** A recording admin client and what it has been asked so far. */
export interface RecordingAdmin {
  /** Every request, in the order the actions sent them. */
  readonly sent: readonly Sent[]

  /** The client `apiForSession` is mocked to hand back. */
  readonly api: MacroplanSessionClient

  /**
   * Refuses every request the predicate accepts, with the status given, and answers the plan for the
   * rest.
   *
   * On the body rather than on the route, because that is where the API's own decision is made: two
   * of the three feature edits are the **same** `PATCH` to the same path and differ only by the field
   * they carry, so a fake keyed on the route could not tell apart the one a seat may send from the one
   * it may not. {@link carries} is how to say "the one carrying this field".
   */
  refuse(matches: (sent: Sent) => boolean, status: number): void
}

const BASE = 'http://api.test'

const planAnswer = (plan: StoredPlan): Response =>
  new Response(JSON.stringify(plan), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const bearerOf = (init: RequestInit): string | undefined =>
  new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '')

/**
 * A real Macroplan admin client over a `fetch` that records what goes out and answers the fixture
 * plan.
 *
 * The real client, the real transport and the real `PlanView` schema all run, so `sent` holds the
 * method, path, bearer and body the API would have received rather than the arguments an action was
 * called with. That is what the per-field property needs asserting against: "one field per request"
 * is a claim about bodies on the wire, and a double standing in for `api.features` could only show
 * that the action called the method it calls.
 *
 * It is keyed on the **bearer**, as `components/plan/testing/fake-plan-api.ts` is and for the reason
 * that file records: a request presenting a credential this fake does not know is answered 401 rather
 * than leniently. {@link ADMIN_TOKEN} is the only one it knows, so an action wired to a link client
 * fails every test here instead of being handed the plan.
 *
 * Every non-refused request is answered with {@link atlasPlan} whatever it asked, which is the one
 * thing this fake does not model: it is not a store, so no test here may assert that a write was
 * applied. `apps/api` owns that, and asserting it from an app test would be a second implementation
 * of the forward pass.
 */
export const recordingAdmin = (plan: StoredPlan = atlasPlan()): RecordingAdmin => {
  const sent: Sent[] = []
  const refusals: { matches: (sent: Sent) => boolean; status: number }[] = []
  const fetcher = (url: string, init: RequestInit): Promise<Response> => {
    const one: Sent = {
      method: init.method ?? 'GET',
      path: new URL(url).pathname,
      bearer: bearerOf(init),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    sent.push(one)
    if (one.bearer !== ADMIN_TOKEN) return Promise.resolve(problemAnswer(401))
    const refused = refusals.find((each) => each.matches(one))
    return Promise.resolve(
      refused === undefined ? planAnswer(plan) : problemAnswer(refused.status),
    )
  }
  return {
    sent,
    api: createMacroplanAdminClient(
      { baseUrl: BASE, serviceKey: 'test-key', fetch: fetcher },
      ADMIN_TOKEN,
    ),
    refuse: (matches, status) => {
      refusals.push({ matches, status })
    },
  }
}
