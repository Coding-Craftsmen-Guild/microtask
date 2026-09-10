import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import jsdoc from 'eslint-plugin-jsdoc'
import n from 'eslint-plugin-n'
import tsdocCommentsOnly from './rules/tsdoc-comments-only.js'

export const local = { rules: { 'tsdoc-comments-only': tsdocCommentsOnly } }

const SIZE_RULES = {
  'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
}

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
    rules: { 'max-lines': ['error', { max: 80, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/testing/**', '**/*.config.*'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'jsdoc/require-jsdoc': 'off',
      'local/tsdoc-comments-only': 'off',
      'n/no-process-env': 'off',
    },
  },
]

export default base
