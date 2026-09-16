import { describe, expect, it, vi } from 'vitest'
import type { ChunkRef } from '@repo/api-client'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import { isArchive, stageFile, type ChunkTarget } from './chunks'
import type { StagedChunk } from './post-chunk'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

const harvested = (path: string, bytes: number): HarvestedFile => ({
  path,
  file: new File([new Uint8Array(bytes)], path.split('/').pop() ?? path),
})

interface Sent {
  readonly ref: ChunkRef
  readonly size: number
}

const target = (maxChunkBytes: number, answer?: (sent: Sent) => StagedChunk) => {
  const sent: Sent[] = []
  let total = 0
  const send = async (ref: ChunkRef, bytes: Blob): Promise<StagedChunk> => {
    const one = { ref, size: bytes.size }
    sent.push(one)
    total += bytes.size
    return Promise.resolve(
      answer?.(one) ?? { path: ref.path, chunkBytes: bytes.size, sessionBytes: total },
    )
  }
  const into: ChunkTarget = { sessionId: SESSION, maxChunkBytes, send }
  return { into, sent }
}

describe('a file is staged chunk by chunk, at an offset the browser tracks per file', () => {
  it('sends one chunk for a file that fits, at offset zero', async () => {
    const { into, sent } = target(1_000_000)
    expect(await stageFile(harvested('drop/a.json', 8_091), into)).toEqual({ path: 'drop/a.json', bytes: 8_091 })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.ref).toEqual({ sessionId: SESSION, path: 'drop/a.json', offset: 0 })
    expect(sent[0]?.size).toBe(8_091)
  })

  it('advances the offset by the bytes already staged, chunk after chunk', async () => {
    const { into, sent } = target(1_000)
    expect((await stageFile(harvested('drop/big.json', 2_500), into)).bytes).toBe(2_500)
    expect(sent.map((one) => one.ref.offset)).toEqual([0, 1_000, 2_000])
    expect(sent.map((one) => one.size)).toEqual([1_000, 1_000, 500])
  })

  it('tracks the offset per file, so two files each start at zero', async () => {
    const { into, sent } = target(1_000)
    await stageFile(harvested('drop/a.json', 1_500), into)
    await stageFile(harvested('drop/b.json', 1_200), into)
    expect(sent.filter((one) => one.ref.path === 'drop/a.json').map((one) => one.ref.offset)).toEqual([0, 1_000])
    expect(sent.filter((one) => one.ref.path === 'drop/b.json').map((one) => one.ref.offset)).toEqual([0, 1_000])
  })

  it('sends the last chunk exactly to the end, never a slice past the file', async () => {
    const { into, sent } = target(1_000)
    await stageFile(harvested('drop/a.json', 1_001), into)
    expect(sent.map((one) => one.size)).toEqual([1_000, 1])
  })

  it('sends one chunk and no more for a file that is exactly the cap', async () => {
    const { into, sent } = target(1_000)
    await stageFile(harvested('drop/a.json', 1_000), into)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.size).toBe(1_000)
  })

  it('sends one empty chunk for a zero-byte file, so the file is staged and not lost', async () => {
    const { into, sent } = target(1_000)
    expect(await stageFile(harvested('drop/empty.json', 0), into)).toEqual({ path: 'drop/empty.json', bytes: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.size).toBe(0)
    expect(sent[0]?.ref.offset).toBe(0)
  })

  it('sends the chunks of one file strictly in sequence, never two at once', async () => {
    const order: string[] = []
    let inFlight = 0
    const send = async (ref: ChunkRef, bytes: Blob): Promise<StagedChunk> => {
      inFlight += 1
      order.push(`start ${String(ref.offset)} of ${String(inFlight)}`)
      await Promise.resolve()
      inFlight -= 1
      return { path: ref.path, chunkBytes: bytes.size, sessionBytes: 0 }
    }
    await stageFile(harvested('drop/a.json', 2_500), { sessionId: SESSION, maxChunkBytes: 1_000, send })
    expect(order).toEqual(['start 0 of 1', 'start 1000 of 1', 'start 2000 of 1'])
  })
})

describe('a server that counted a different number of bytes rejects the file', () => {
  it('rejects rather than advancing by a count neither side agrees on', async () => {
    const { into } = target(1_000, (one) => ({
      path: one.ref.path,
      chunkBytes: one.size - 1,
      sessionBytes: 0,
    }))
    await expect(stageFile(harvested('drop/a.json', 500), into)).rejects.toThrow(
      /counted 499 bytes of drop\/a\.json where 500 were sent/,
    )
  })

  it('stops at the chunk that disagreed rather than carrying on through the file', async () => {
    const send = vi.fn(async (ref: ChunkRef) => Promise.resolve({ path: ref.path, chunkBytes: 0, sessionBytes: 0 }))
    await expect(
      stageFile(harvested('drop/a.json', 2_500), { sessionId: SESSION, maxChunkBytes: 1_000, send }),
    ).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('lets a refused chunk reject the file, so the caller reports that file and no other', async () => {
    const send = () => Promise.reject(new Error('409'))
    await expect(
      stageFile(harvested('drop/a.json', 10), { sessionId: SESSION, maxChunkBytes: 1_000, send }),
    ).rejects.toThrow('409')
  })
})

describe('an archive is named by its extension, because the browser never opens one', () => {
  it.each(['drop.zip', 'volume/Backup.ZIP', 'a/b/c.Zip'])('treats %s as an archive', (path) => {
    expect(isArchive(path)).toBe(true)
  })

  it.each(['drop/a.json', 'manifest.json', 'zip', 'a.zip.json', 'notes.zipped'])(
    'treats %s as an ordinary file',
    (path) => {
      expect(isArchive(path)).toBe(false)
    },
  )
})

describe('the staged path answered is the server own, not the one that was sent', () => {
  it('answers the normalised path, so an expansion addresses the file the session holds', async () => {
    const { into } = target(1_000, (one) => ({
      path: one.ref.path.replaceAll('/./', '/'),
      chunkBytes: one.size,
      sessionBytes: 0,
    }))
    const staged = await stageFile(harvested('drop/./deep.zip', 10), into)
    expect(staged.path).toBe('drop/deep.zip')
  })

  it('keeps the last chunk answer, so a multi-chunk file is addressed by one path', async () => {
    const { into } = target(1_000, (one) => ({
      path: 'drop/normalised.json',
      chunkBytes: one.size,
      sessionBytes: 0,
    }))
    const staged = await stageFile(harvested('drop/./x.json', 2_500), into)
    expect(staged).toEqual({ path: 'drop/normalised.json', bytes: 2_500 })
  })
})
