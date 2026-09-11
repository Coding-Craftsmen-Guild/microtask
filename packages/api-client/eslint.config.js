import base, { productImportPatterns } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'hono', message: 'the client is transport-only and imports no server framework (ADR 0024)' },
          { name: '@hono/zod-openapi', message: 'the client is transport-only and imports no server framework (ADR 0024)' },
          { name: 'zod', message: 'shapes come from @repo/contracts so the client cannot drift (ADR 0024)' },
        ],
        patterns: productImportPatterns,
      }],
    },
  },
]
