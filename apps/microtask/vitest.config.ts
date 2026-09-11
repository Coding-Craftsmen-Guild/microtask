import { defineConfig } from 'vitest/config'

// Two projects rather than one environment, because the two halves of this app are tested
// against different globals. `lib/**` is server-only — node:crypto, cookies, redirects — and
// happy-dom would give it a `window` no request ever has. The `.tsx` half needs a DOM and the
// `@testing-library/react` cleanup hook, which is what vitest.setup.ts installs.

const node = {
  test: {
    name: 'node',
    environment: 'node',
    include: ['lib/**/*.test.ts', 'actions/**/*.test.ts', 'app/**/*.test.ts', '*.test.ts'],
  },
}

const dom = {
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  test: {
    name: 'dom',
    environment: 'happy-dom',
    include: ['app/**/*.test.tsx', 'components/**/*.test.tsx', 'lib/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
}

export default defineConfig({ test: { projects: [node, dom] } })
