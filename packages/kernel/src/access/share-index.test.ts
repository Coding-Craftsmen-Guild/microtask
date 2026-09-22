import { describe, expect, it } from 'vitest'
import { Conflict } from '../errors.js'
import type { TokenOwner } from './token-index.js'
import { ShareIndex } from './share-index.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const TOKEN = 'tok_abcdefghijklmnop'

const project = (containerId: string): TokenOwner => ({ product: 'microtask', containerId })
const plan = (containerId: string): TokenOwner => ({ product: 'macroplan', containerId })

describe('ShareIndex', () => {
  it('resolves a token to its container', () => {
    const index = new ShareIndex()
    index.add(project(P1), [TOKEN])
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', containerId: P1 })
  })

  it('returns null for a token it has never seen', () => {
    expect(new ShareIndex().find('tok_zzzzzzzzzzzzzzzz')).toBeNull()
  })

  it('refuses a token already owned by another container', () => {
    const index = new ShareIndex()
    index.add(project(P1), [TOKEN])
    expect(() => index.add(project(P2), [TOKEN])).toThrow(Conflict)
  })

  it('refuses the same container id under another product, and records nothing for it', () => {
    const index = new ShareIndex()
    const fresh = 'tok_freshfreshfresh1'
    index.add(project(P1), [TOKEN])
    expect(() => index.add(plan(P1), [fresh, TOKEN])).toThrow(Conflict)
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', containerId: P1 })
    expect(index.find(fresh)).toBeNull()
  })

  it('leaves the index untouched when it rejects a collision', () => {
    const index = new ShareIndex()
    const owned = 'tok_p2ownaaaaaaaaaa'
    const fresh = 'tok_freshfreshfresh1'
    index.add(project(P1), [TOKEN])
    index.add(project(P2), [owned])
    expect(() => index.add(project(P2), [fresh, TOKEN])).toThrow(Conflict)
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', containerId: P1 })
    expect(index.find(owned)).toEqual({ product: 'microtask', containerId: P2 })
    expect(index.find(fresh)).toBeNull()
  })

  it('re-adding the same container replaces only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add(project(P1), [TOKEN])
    index.add(project(P2), [other])
    index.add(project(P1), [])
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).toEqual({ product: 'microtask', containerId: P2 })
  })

  it('removing a container drops only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add(project(P1), [TOKEN])
    index.add(project(P2), [other])
    index.remove(project(P1))
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).not.toBeNull()
  })

  it('removing a plan leaves the project of the same id holding every token it had', () => {
    const index = new ShareIndex()
    const planned = 'tok_planplanplanpla'
    index.add(project(P1), [TOKEN])
    index.add(plan(P1), [planned])
    index.remove(plan(P1))
    expect(index.find(planned)).toBeNull()
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', containerId: P1 })
  })

  it('reports the tokens that would collide, before anything is written', () => {
    const index = new ShareIndex()
    index.add(project(P1), [TOKEN])
    expect(index.collisions(project(P2), [TOKEN, 'tok_freshfreshfresh1'])).toEqual([TOKEN])
    expect(index.collisions(project(P1), [TOKEN])).toEqual([])
    expect(index.collisions(plan(P1), [TOKEN])).toEqual([TOKEN])
  })
})
