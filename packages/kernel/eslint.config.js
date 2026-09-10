import base from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@repo/microtask-domain', '@repo/microtask-domain/*', '@repo/macroplan-domain', '@repo/macroplan-domain/*'],
          message: 'shared code must not depend on a product (ADR 0014)',
        }],
      }],
    },
  },
]
