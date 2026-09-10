import base, { productImportPatterns } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...productImportPatterns,
          {
            group: ['@repo/contracts', '@repo/contracts/*'],
            message: 'packages/store is generic infrastructure and imports no contract schemas (ADR 0027)',
          },
        ],
      }],
    },
  },
]
