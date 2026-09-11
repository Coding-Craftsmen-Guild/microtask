import base, { productImportPatterns } from '@repo/eslint-config'

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...base,
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
]
