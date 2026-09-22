import { configDefaults, defineConfig } from 'vitest/config'

// Two projects rather than one environment, because the two halves of this app are tested
// against different globals. The server-only half — node:crypto, cookies, redirects — must not
// be handed a `window` no request ever has, and the rendering half needs a DOM and the
// `@testing-library/react` cleanup hook, which is what vitest.setup.ts installs.
//
// The split is by **extension** and names no directory, which is the fix for a hole measured in
// apps/microtask: lists naming `lib/**`, `actions/**` and the rest left three shapes matching no
// project, and a file matching no project is not an error — it silently never runs and the suite
// reports its usual green. `vitest.projects.test.ts` fails if a directory ever reappears here.

const EXCLUDE = [...configDefaults.exclude, '.next/**', '.turbo/**']

const node = {
  test: {
    name: 'node',
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: EXCLUDE,
  },
}

const dom = {
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    name: 'dom',
    environment: 'happy-dom',
    include: ['**/*.test.tsx'],
    exclude: EXCLUDE,
    setupFiles: ['./vitest.setup.ts'],
  },
}

export default defineConfig({ test: { projects: [node, dom] } })
