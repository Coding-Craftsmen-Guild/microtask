import base, { noProductImports } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: { ...noProductImports },
  },
]
