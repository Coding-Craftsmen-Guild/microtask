import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import jsdoc from 'eslint-plugin-jsdoc'
import n from 'eslint-plugin-n'
import reactHooks from 'eslint-plugin-react-hooks'
import tsdocCommentsOnly from './rules/tsdoc-comments-only.js'

/** ESLint plugin exposing this workspace only rules under the local namespace. */
export const local = { rules: { 'tsdoc-comments-only': tsdocCommentsOnly } }

/**
 * The package-name globs that identify a product package, as one `no-restricted-imports`
 * pattern group. Exported on its own so a package needing further bans can concatenate it
 * into its single options object: the rule's options do not merge across flat-config
 * objects, and a second matching block replaces the first outright.
 */
export const productImportPatterns = [
  {
    group: ['@repo/*-domain', '@repo/*-domain/*'],
    message: 'shared code must not depend on a product (ADR 0014)',
  },
]

/** Bans product packages from shared code (ADR 0014). Spread into a `files`-scoped block. */
export const noProductImports = {
  'no-restricted-imports': ['error', { patterns: productImportPatterns }],
}

const SIZE_RULES = {
  'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
}

/** Shared flat config: strict TypeScript, the ADR 0027 size caps, and TSDoc only comments. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { import: importPlugin, jsdoc, n, local },
    rules: {
      ...SIZE_RULES,
      'max-lines': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'local/tsdoc-comments-only': 'error',
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: true },
        contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'VariableDeclaration'],
      }],
      'n/no-process-env': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'max-lines': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.config.*'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'jsdoc/require-jsdoc': 'off',
      'local/tsdoc-comments-only': 'off',
      'n/no-process-env': 'off',
    },
  },
  {
    files: ['**/testing/**'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-nested-callbacks': 'off',
      'n/no-process-env': 'off',
    },
  },
]

export default base
