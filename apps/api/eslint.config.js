import base from '@repo/eslint-config'

export default [
  ...base,
  {
    // The one file allowed to read the environment. Scoped here rather than disabled
    // inline, so "which file reads process.env" is answered by the config (ADR 0027).
    files: ['src/server.ts'],
    rules: { 'n/no-process-env': 'off' },
  },
]
