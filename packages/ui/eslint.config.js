import base, { noProductImports, vendoredComponents } from '@repo/eslint-config'

export default [
  ...base,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { ...noProductImports },
  },
  ...vendoredComponents(),
]
