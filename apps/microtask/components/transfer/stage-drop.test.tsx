import { describe, expect, it, vi } from 'vitest'
import type { ChunkRef } from '@repo/api-client'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import { stageDrop, type DropPorts } from './stage-drop'
import type { StagedChunk } from './post-chunk'
import { RefusedUploadError, UPLOAD_REFUSALS } from './refusal'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

const opened = { sessionId: SESSION, openedAt: 'S', maxChunkBytes: 1_000, maxSessionBytes: 40_000_000 }

const plan = { sessionId: SESSION, groups: [] }

const harvested = (path: string, bytes = 10): HarvestedFile => ({
  path,
  file: new File([new Uint8Array(bytes)], path.split('/').pop() ?? path),
})

const ports = (over: Partial<DropPorts> = {}) => {
  const sent: ChunkRef[] = []
  const expanded: string[] = []
  const base: DropPorts = {
    open: () => Promise.resolve({ ok: true, value: opened }),
    send: (ref: ChunkRef, bytes: Blob): Promise<StagedChunk> => {
      sent.push(ref)
      return Promise.resolve({ path: ref.path, chunkBytes: bytes.size, sessionBytes: bytes.size })
    },
    expand: (_sessionId: string, path: string) => {
      expanded.push(path)
      return Promise.resolve({ ok: true, value: null })
    },
    preview: () => Promise.resolve({ ok: true, value: plan }),
  }
  return { all: { ...base, ...over }, sent, expanded }
}

describe('a drop is staged, expanded and previewed, in that order', () => {
  it('opens one session and stages every harvested file into it', async () => {
    const { all, sent } = ports()
    const outcome = await stageDrop([harvested('drop/a.json'), harvested('drop/b.json')], all)
    expect(outcome).toEqual({ ok: true, sessionId: SESSION, preview: plan, failures: [] })
    expect(sent.map((one) => one.path).sort()).toEqual(['drop/a.json', 'drop/b.json'])
    expect(sent.every((one) => one.sessionId === SESSION)).toBe(true)
  })

  it('slices by the cap the server answered, never by a number of its own', async () => {
    const { all, sent } = ports()
    await stageDrop([harvested('drop/big.json', 2_500)], all)
    expect(sent.map((one) => one.offset)).toEqual([0, 1_000, 2_000])
  })

  it('asks for an expansion of every staged zip, at the path the server staged it at', async () => {
    const { all, expanded } = ports({
      send: (ref, bytes) =>
        Promise.resolve({ path: ref.path.replace('/./', '/'), chunkBytes: bytes.size, sessionBytes: 0 }),
    })
    await stageDrop([harvested('drop/./volume.zip'), harvested('drop/a.json')], all)
    expect(expanded).toEqual(['drop/volume.zip'])
  })

  it('asks for no expansion at all when nothing dropped was an archive', async () => {
    const { all, expanded } = ports()
    await stageDrop([harvested('drop/a.json')], all)
    expect(expanded).toEqual([])
  })

  it('previews the session it staged, once, after every upload and expansion', async () => {
    const order: string[] = []
    const { all } = ports({
      send: (ref, bytes) => {
        order.push(`send ${ref.path}`)
        return Promise.resolve({ path: ref.path, chunkBytes: bytes.size, sessionBytes: 0 })
      },
      expand: (_sessionId, path) => {
        order.push(`expand ${path}`)
        return Promise.resolve({ ok: true, value: null })
      },
      preview: () => {
        order.push('preview')
        return Promise.resolve({ ok: true, value: plan })
      },
    })
    await stageDrop([harvested('drop/a.zip')], all)
    expect(order).toEqual(['send drop/a.zip', 'expand drop/a.zip', 'preview'])
  })

  it('expands archives one after another rather than all at once', async () => {
    let inFlight = 0
    let peak = 0
    const { all } = ports({
      expand: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return { ok: true, value: null }
      },
    })
    await stageDrop([harvested('a.zip'), harvested('b.zip'), harvested('c.zip')], all)
    expect(peak).toBe(1)
  })
})

describe('a failure about one file ends that file and nothing else (ADR 0018)', () => {
  it('names the refused file and still previews everything that landed', async () => {
    const tried: string[] = []
    const { all } = ports({
      send: (ref, bytes) => {
        tried.push(ref.path)
        if (ref.path === 'drop/bad.json') {
          return Promise.reject(new RefusedUploadError({ status: 409, code: 'conflict', maxBytes: null }))
        }
        return Promise.resolve({ path: ref.path, chunkBytes: bytes.size, sessionBytes: 0 })
      },
    })
    const outcome = await stageDrop(
      [harvested('drop/a.json'), harvested('drop/bad.json'), harvested('drop/c.json')],
      all,
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.ok ? outcome.failures : []).toEqual([
      { path: 'drop/bad.json', detail: UPLOAD_REFUSALS.conflict },
    ])
    expect([...tried].sort()).toEqual(['drop/a.json', 'drop/bad.json', 'drop/c.json'])
  })

  it('names the cap a 413 carried against that file, rather than saying "too large"', async () => {
    const { all } = ports({
      send: () => Promise.reject(new RefusedUploadError({ status: 413, code: 'too_large', maxBytes: 1_000_000 })),
    })
    const outcome = await stageDrop([harvested('drop/huge.json')], all)
    expect(outcome.ok ? outcome.failures[0]?.detail : '').toContain('1,000,000 bytes')
  })

  it('names an archive the server refused to expand, and still previews the rest', async () => {
    const { all } = ports({
      expand: () => Promise.resolve({ ok: false, status: 422, detail: 'that zip has a traversal in it' }),
    })
    const outcome = await stageDrop([harvested('drop/a.zip'), harvested('drop/b.json')], all)
    expect(outcome.ok).toBe(true)
    expect(outcome.ok ? outcome.failures : []).toEqual([
      { path: 'drop/a.zip', detail: 'that zip has a traversal in it' },
    ])
  })

  it('reports a file whose chunk count the server disagreed with, in this surface own words', async () => {
    const { all } = ports({
      send: (ref) => Promise.resolve({ path: ref.path, chunkBytes: 1, sessionBytes: 1 }),
    })
    const outcome = await stageDrop([harvested('drop/a.json', 10)], all)
    expect(outcome.ok ? outcome.failures[0] : null).toEqual({
      path: 'drop/a.json',
      detail: UPLOAD_REFUSALS.broken,
    })
  })

  it('never answers a preview with no failures when a file was refused', async () => {
    const { all } = ports({ send: () => Promise.reject(new Error('dead socket')) })
    const outcome = await stageDrop([harvested('drop/a.json')], all)
    expect(outcome.ok ? outcome.failures.length : 0).toBe(1)
  })
})

describe('a failure about the session ends the drop, with a sentence and no empty table', () => {
  it('answers the refusal when a session could not be opened, and uploads nothing', async () => {
    const send = vi.fn()
    const { all } = ports({
      open: () => Promise.resolve({ ok: false, status: 403, detail: 'not allowed to import' }),
      send,
    })
    expect(await stageDrop([harvested('drop/a.json')], all)).toEqual({
      ok: false,
      detail: 'not allowed to import',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('answers the refusal when the preview itself failed, rather than an empty plan', async () => {
    const { all } = ports({
      preview: () => Promise.resolve({ ok: false, status: 404, detail: 'that session is gone' }),
    })
    expect(await stageDrop([harvested('drop/a.json')], all)).toEqual({
      ok: false,
      detail: 'that session is gone',
    })
  })
})

describe('an empty harvest is not a special case', () => {
  it('still opens a session and previews it, which is a plan with no rows', async () => {
    const { all, sent } = ports()
    const outcome = await stageDrop([], all)
    expect(outcome).toEqual({ ok: true, sessionId: SESSION, preview: plan, failures: [] })
    expect(sent).toEqual([])
  })
})
