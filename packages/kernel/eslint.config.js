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
            group: ['@repo/contracts', '@repo/contracts/*', '@repo/store', '@repo/store/*'],
            message: 'packages/kernel imports no adapter and no framework (ADR 0027)',
          },
        ],
      }],
    },
  },
]
