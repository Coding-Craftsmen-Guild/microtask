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
            group: ['@repo/store', '@repo/store/*', '@repo/kernel', '@repo/kernel/*'],
            message: 'both apps import this package, so a reach into the store here would be their way around the API (ADR 0002, ADR 0027)',
          },
        ],
      }],
    },
  },
  {
    // The one file allowed to read the environment, for either app. Scoped here rather than
    // disabled inline, so "which file reads process.env" is answered by a config (ADR 0012),
    // and because an inline directive would itself be a non-TSDoc comment.
    files: ['src/env.ts'],
    rules: { 'n/no-process-env': 'off' },
  },
]
