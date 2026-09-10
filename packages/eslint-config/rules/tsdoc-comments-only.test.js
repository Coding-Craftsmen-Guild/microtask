import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import rule from './tsdoc-comments-only.js'

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
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
})
