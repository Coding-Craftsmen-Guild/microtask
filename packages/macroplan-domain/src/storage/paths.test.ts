import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { itemFile, itemsDir, manifestFile, planDir, plansDir } from './paths.js'

const ROOT = path.resolve('/data')
const PLAN = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ITEM = '01M240FB4GD6PF6V0PKZVF6FD9'
const BAD_IDS = ['..', '../other', 'a/b', '/etc/passwd', 'not-a-ulid', '', 'IIIIIIIIIIIIIIIIIIIIIIIIII']

describe('plansDir', () => {
  it('sits beside plan/ files at the product root, one segment above any plan id', () => {
    expect(plansDir(ROOT, 'macroplan')).toBe(path.join(ROOT, 'macroplan', 'plans'))
  })

  it('keys every product to its own root', () => {
    expect(plansDir(ROOT, 'microtask')).toBe(path.join(ROOT, 'microtask', 'plans'))
  })

  it('refuses an unknown product', () => {
    expect(() => plansDir(ROOT, 'other' as 'microtask')).toThrow(Invalid)
  })
})

describe('planDir', () => {
  it('places a plan under the plans directory', () => {
    expect(planDir(ROOT, 'macroplan', PLAN)).toBe(path.join(ROOT, 'macroplan', 'plans', PLAN))
  })

  it.each(BAD_IDS)('refuses %j as a plan id', (bad) => {
    expect(() => planDir(ROOT, 'macroplan', bad)).toThrow(Invalid)
  })

  it('refuses an unknown product', () => {
    expect(() => planDir(ROOT, 'other' as 'microtask', PLAN)).toThrow(Invalid)
  })
})

describe('manifestFile', () => {
  it('names the manifest inside the plan directory', () => {
    expect(manifestFile(ROOT, 'macroplan', PLAN)).toBe(
      path.join(ROOT, 'macroplan', 'plans', PLAN, 'plan.json'),
    )
  })

  it.each(BAD_IDS)('refuses %j as a plan id', (bad) => {
    expect(() => manifestFile(ROOT, 'macroplan', bad)).toThrow(Invalid)
  })

  it('refuses an unknown product', () => {
    expect(() => manifestFile(ROOT, 'other' as 'microtask', PLAN)).toThrow(Invalid)
  })
})

describe('itemsDir', () => {
  it('names the items directory inside the plan directory', () => {
    expect(itemsDir(ROOT, 'macroplan', PLAN)).toBe(
      path.join(ROOT, 'macroplan', 'plans', PLAN, 'items'),
    )
  })

  it.each(BAD_IDS)('refuses %j as a plan id', (bad) => {
    expect(() => itemsDir(ROOT, 'macroplan', bad)).toThrow(Invalid)
  })

  it('refuses an unknown product', () => {
    expect(() => itemsDir(ROOT, 'other' as 'microtask', PLAN)).toThrow(Invalid)
  })
})

describe('itemFile', () => {
  it('names an item file inside the items directory', () => {
    expect(itemFile(ROOT, 'macroplan', PLAN, ITEM)).toBe(
      path.join(ROOT, 'macroplan', 'plans', PLAN, 'items', `${ITEM}.json`),
    )
  })

  it.each(BAD_IDS)('refuses %j as a plan id', (bad) => {
    expect(() => itemFile(ROOT, 'macroplan', bad, ITEM)).toThrow(Invalid)
  })

  it.each(BAD_IDS)('refuses %j as an item id', (bad) => {
    expect(() => itemFile(ROOT, 'macroplan', PLAN, bad)).toThrow(Invalid)
  })

  it('refuses an unknown product', () => {
    expect(() => itemFile(ROOT, 'other' as 'microtask', PLAN, ITEM)).toThrow(Invalid)
  })

  it('stays under the plan it names however the id is spelled', () => {
    const built = itemFile(ROOT, 'macroplan', PLAN, ITEM)
    expect(built.startsWith(planDir(ROOT, 'macroplan', PLAN) + path.sep)).toBe(true)
  })
})
