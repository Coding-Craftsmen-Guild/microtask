import { defineConfig } from 'vitest/config'

/**
 * The node lane, and a test timeout the repo-wide gate actually needs.
 *
 * Two tests in `api.test.ts` re-read the environment, which `api.ts` reads once at module scope, so
 * each calls `vi.resetModules()` and then `await import('./api')` **inside** the test body. That
 * import pays for transforming the module graph, and the cost is billed to the test's own clock
 * rather than to collection. Run alone this package transforms in about 2s and finishes in 2.5s;
 * under `turbo run build typecheck lint test --force`, with a dozen packages transforming at once on
 * one machine, the same work takes about 16s and vitest's 5s default fails those two tests and
 * nothing else. The failure is contention, not a hang: the assertions never changed.
 *
 * The number is deliberately far above the observed 16s rather than just clear of it, because the
 * margin has to hold on a busier machine than this one. It is set here rather than per-test so the
 * reason lives in one place, and raised rather than worked around: hoisting the import out of the
 * test body would mean reading the environment at call time instead of at module scope, which is a
 * change to shipped code for a test's convenience.
 */
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 60_000 },
})
