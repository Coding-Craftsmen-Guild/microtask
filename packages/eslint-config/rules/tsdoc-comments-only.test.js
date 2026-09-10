import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import rule from './tsdoc-comments-only.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

const tsTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: 'module' },
})

describe('tsdoc-comments-only', () => {
  it('allows TSDoc on exports and rejects everything else', () => {
    tester.run('tsdoc-comments-only', rule, {
      valid: [
        '/** Counts things. */\nexport function count() {}',
        '/** A thing. */\nexport const a = 1',
        '/** Outer. */\nexport class A {\n  /** Inner. */\n  b() {}\n}',
      ],
      invalid: [
        { code: '// hello\nexport const a = 1', errors: [{ messageId: 'disallowed' }] },
        { code: '/** Not exported. */\nconst a = 1', errors: [{ messageId: 'disallowed' }] },
        { code: 'export const a = 1 // trailing', errors: [{ messageId: 'disallowed' }] },
        { code: '/* banner */\nexport const a = 1', errors: [{ messageId: 'disallowed' }] },
      ],
    })
  })

  it('ignores a hashbang, so an executable entry file is not an error', () => {
    tester.run('tsdoc-comments-only', rule, {
      valid: ['#!/usr/bin/env node\n/** Doc. */\nexport const a = 1'],
      invalid: [],
    })
  })

  it('rejects narration inside an exported body, which is the same comment ADR 0027 bans as //', () => {
    tester.run('tsdoc-comments-only', rule, {
      valid: [
        '/** Sums. */\nexport function total(xs) {\n  let sum = 0\n  for (const x of xs) sum += x\n  return sum\n}',
        '/** Outer. */\nexport default class A {\n  /** Field. */\n  b = 1\n\n  /** Method. */\n  c() {}\n}',
      ],
      invalid: [
        {
          code: '/** Sums. */\nexport function total(xs) {\n  /** Seed it, because reduce needs a start. */\n  let sum = 0\n  return sum\n}',
          errors: [{ messageId: 'disallowed' }],
        },
        {
          code: '/** Runs. */\nexport const run = () => {\n  /** Narration. */\n  return 1\n}',
          errors: [{ messageId: 'disallowed' }],
        },
        {
          code: '/** Outer. */\nexport function f() {\n  class B {\n    /** Not the export member. */\n    m() {}\n  }\n  return B\n}',
          errors: [{ messageId: 'disallowed' }],
        },
      ],
    })
  })

  it('keeps documenting the members of an exported interface legal', () => {
    tsTester.run('tsdoc-comments-only', rule, {
      valid: [
        '/** A port. */\nexport interface P {\n  /** Reads. */\n  read(file: string): Promise<string>\n\n  /** A flag. */\n  readonly open: boolean\n}',
        '/** Levels. */\nexport enum L {\n  /** Low. */\n  Low = 1,\n}',
      ],
      invalid: [
        {
          code: '/** Reads. */\nexport function read(file: string): number {\n  /** Narration. */\n  const size: number = file.length\n  return size\n}',
          errors: [{ messageId: 'disallowed' }],
        },
      ],
    })
  })
})
