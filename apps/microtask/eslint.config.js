import base, { productImportPatterns } from '@repo/eslint-config'

// The shared config applies react-hooks to `**/*.tsx` only, and this app keeps three hooks in
// `.ts` files: use-workspace, use-tab-operations and use-autosave. A dropped dependency there
// once sent every save after a tab switch to the tab the page opened on, with lint green. The
// plugin object is taken from the shared config rather than imported, so it is the same
// instance and this package declares no dependency of its own for it.
const hooksBlock = base.find((block) => block.plugins?.['react-hooks'] !== undefined)

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base,
  {
    files: ['**/*.ts'],
    plugins: { 'react-hooks': hooksBlock.plugins['react-hooks'] },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...productImportPatterns,
          {
            group: ['@repo/store', '@repo/store/*', '@repo/kernel', '@repo/kernel/*'],
            message: 'the app reads and writes only through @repo/api-client, so the API stays the single writer (ADR 0002, ADR 0027)',
          },
          {
            group: ['@repo/microtask-domain', '@repo/microtask-domain/*', '@repo/macroplan-domain', '@repo/macroplan-domain/*'],
            message: 'the domain barrel reaches node:path and node:crypto, and the app must not bypass the API (ADR 0014, ADR 0027)',
          },
        ],
      }],
    },
  },
  {
    // The one file allowed to read the environment. Scoped here rather than disabled
    // inline, so "which file reads process.env" is answered by the config (ADR 0012),
    // and because an inline directive would itself be a non-TSDoc comment.
    files: ['lib/env.ts'],
    rules: { 'n/no-process-env': 'off' },
  },
]
