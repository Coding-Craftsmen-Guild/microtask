import base, { productImportPatterns } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@hono/zod-openapi', message: 'contracts must stay framework-free; use z.meta({ id }) from zod (ADR 0024)' },
          { name: 'hono', message: 'contracts must stay framework-free (ADR 0024)' },
          { name: '@asteasolutions/zod-to-openapi', message: 'contracts must stay framework-free (ADR 0024)' },
        ],
        patterns: productImportPatterns,
      }],
    },
  },
]
