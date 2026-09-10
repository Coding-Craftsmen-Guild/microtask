import { describe, expect, it } from 'vitest'
import { Conflict } from '@repo/kernel'
import { manifest } from '../testing/index.js'
import type { ShareLink } from '../entities/share-link.js'
import { ShareIndex } from './share-index.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const TOKEN = 'tok_abcdefghijklmnop'

const link = (token: string, projectId: string): ShareLink => ({
  token,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'project', projectId },
  createdBy: null,
  createdAt: '2026-09-10T00:00:00.000Z',
})

describe('ShareIndex', () => {
  it('resolves a token to its project', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', projectId: P1 })
  })

  it('returns null for a token it has never seen', () => {
    expect(new ShareIndex().find('tok_zzzzzzzzzzzzzzzz')).toBeNull()
  })

  it('refuses a token already owned by another project', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(() => index.add('microtask', manifest(P2, { shareLinks: [link(TOKEN, P2)] }))).toThrow(Conflict)
  })

  it('refuses a token owned by another product', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(() => index.add('macroplan', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))).toThrow(Conflict)
  })

  it('leaves the index untouched when it rejects a collision', () => {
    const index = new ShareIndex()
    const owned = 'tok_p2ownaaaaaaaaaa'
    const fresh = 'tok_freshfreshfresh1'
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    index.add('microtask', manifest(P2, { shareLinks: [link(owned, P2)] }))
    expect(() =>
      index.add('microtask', manifest(P2, { shareLinks: [link(fresh, P2), link(TOKEN, P2)] })),
    ).toThrow(Conflict)
    expect(index.find(TOKEN)).toEqual({ product: 'microtask', projectId: P1 })
    expect(index.find(owned)).toEqual({ product: 'microtask', projectId: P2 })
    expect(index.find(fresh)).toBeNull()
  })

  it('re-adding the same project replaces only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    index.add('microtask', manifest(P2, { shareLinks: [link(other, P2)] }))
    index.add('microtask', manifest(P1, { shareLinks: [] }))
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).toEqual({ product: 'microtask', projectId: P2 })
  })

  it('removing a project drops only its own tokens', () => {
    const index = new ShareIndex()
    const other = 'tok_bbbbbbbbbbbbbbbb'
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    index.add('microtask', manifest(P2, { shareLinks: [link(other, P2)] }))
    index.removeProject('microtask', P1)
    expect(index.find(TOKEN)).toBeNull()
    expect(index.find(other)).not.toBeNull()
  })

  it('reports the tokens that would collide, before anything is written', () => {
    const index = new ShareIndex()
    index.add('microtask', manifest(P1, { shareLinks: [link(TOKEN, P1)] }))
    expect(index.collisions('microtask', P2, [TOKEN, 'tok_freshfreshfresh1'])).toEqual([TOKEN])
    expect(index.collisions('microtask', P1, [TOKEN])).toEqual([])
  })
})
