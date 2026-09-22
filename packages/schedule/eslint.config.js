import base, { noProductImports } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: { ...noProductImports },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'import/no-nodejs-modules': 'error' },
  },
]
