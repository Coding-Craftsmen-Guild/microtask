import { configDefaults, defineConfig } from 'vitest/config'

// Two projects rather than one environment, because the two halves of this app are tested
// against different globals. The server-only half — node:crypto, cookies, redirects — must not
// be handed a `window` no request ever has, and the rendering half needs a DOM and the
// `@testing-library/react` cleanup hook, which is what vitest.setup.ts installs.
//
// The split is by **extension**, and that is the fix for a measured hole rather than a style
// choice. These lists used to name directories — `lib/**`, `actions/**`, `app/**`,
// `components/**` — and three shapes fell between them: `components/**/*.test.ts`,
// `actions/**/*.test.tsx`, and any `*.test.tsx` at the app root. A file matching no project is
// not an error; it silently never runs, and the suite reports its usual green. One rule with no
// directory in it has no gaps to add a directory to, and `vitest.projects.test.ts` fails if one
// ever reappears.

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
