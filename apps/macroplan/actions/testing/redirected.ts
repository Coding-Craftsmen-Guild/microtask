/**
 * What `redirect` throws in these tests, carrying where it was sent.
 *
 * Its own module because a redirect sentinel has nothing to do with a recording admin client: every
 * test that mocks `next/navigation` for this app needs it, `components/plan/admin-actions.test.ts`
 * included, and that one wires no client at all. One sentinel rather than a bare `Error` per test
 * file is what makes {@link redirectOf} able to tell a redirect from any other rejection.
 *
 * `apps/microtask/actions/testing/fake-admin.ts` holds the same pair for its own app. The copy
 * stays: neither app may import the other's source, and `@repo/app-session` exports one module per
 * file with no home for test helpers, so sharing it would mean inventing a public export surface
 * for two declarations.
 */
export class Redirected extends Error {
  /** Records the location `redirect` was handed. */
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

/** Settles an action that is expected to redirect, and answers where to. */
export const redirectOf = async (attempt: Promise<unknown>): Promise<string> => {
  const outcome = await attempt.then(
    () => null,
    (error: unknown) => error,
  )
  if (!(outcome instanceof Redirected)) {
    throw new Error(`expected a redirect, got ${String(outcome)}`)
  }
  return outcome.location
}
