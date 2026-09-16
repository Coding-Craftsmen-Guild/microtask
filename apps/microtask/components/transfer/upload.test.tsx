import { describe, expect, it } from 'vitest'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import { UPLOAD_CONCURRENCY, uploadFiles } from './upload'

const FILES = 200

const harvest = (count: number): readonly HarvestedFile[] =>
  Array.from({ length: count }, (_unused, index) => ({
    path: `drop/tasks/${String(index).padStart(3, '0')}.json`,
    file: new File([String(index)], `${String(index)}.json`),
  }))

const HOPS = 12

const tick = async (): Promise<void> => {
  for (let hop = 0; hop < HOPS; hop += 1) await Promise.resolve()
}

/**
 * A fake upload whose promises are released **explicitly**, one at a time, by the test.
 *
 * This is the whole of what makes the bound observable. A fake that resolved on its own — even a
 * `Promise.resolve()` — would let each worker finish before the next one started, so the greatest
 * in-flight count a test could observe would be 1 for *every* implementation, including one that
 * fires all 200 at once. Nothing is released until `release` or `drain` is called, so the count
 * standing when the run first goes quiet is exactly the number of files the implementation chose
 * to start.
 */
const releasable = (rejectAt: readonly number[] = []) => {
  const waiting: (() => void)[] = []
  const started: string[] = []
  let inFlight = 0
  let peak = 0
  const send = (file: HarvestedFile): Promise<void> => {
    const index = started.length
    started.push(file.path)
    inFlight += 1
    peak = Math.max(peak, inFlight)
    return new Promise<void>((resolve, reject) => {
      waiting.push(() => {
        inFlight -= 1
        if (rejectAt.includes(index)) reject(new Error(`refused ${file.path}`))
        else resolve()
      })
    })
  }
  const release = (): void => {
    waiting.shift()?.()
  }
  const drain = async (): Promise<void> => {
    while (waiting.length > 0) {
      release()
      await tick()
    }
  }
  return {
    send,
    release,
    drain,
    started,
    inFlight: () => inFlight,
    peak: () => peak,
  }
}

describe('the browser uploads under a bound, and the bound is a named constant', () => {
  it('names a bound above one, since a bound of one is a sequential upload', () => {
    expect(UPLOAD_CONCURRENCY).toBeGreaterThan(1)
  })

  it('names a bound far below a large drop, so the bound is what a run is limited by', () => {
    expect(UPLOAD_CONCURRENCY).toBeLessThan(FILES)
  })
})

describe('with 200 files the upload reaches the bound and never passes it', () => {
  it('holds exactly the bound in flight while nothing has been released', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(FILES), lane.send)
    await tick()
    expect(lane.inFlight()).toBe(UPLOAD_CONCURRENCY)
    expect(lane.peak()).toBe(UPLOAD_CONCURRENCY)
    expect(lane.started).toHaveLength(UPLOAD_CONCURRENCY)
    await lane.drain()
    await run
  })

  it('starts one more file for each one released, and no more than one', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(FILES), lane.send)
    await tick()
    lane.release()
    await tick()
    expect(lane.started).toHaveLength(UPLOAD_CONCURRENCY + 1)
    expect(lane.inFlight()).toBe(UPLOAD_CONCURRENCY)
    await lane.drain()
    await run
  })

  it('never exceeds the bound at any point across the whole run', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(FILES), lane.send)
    await lane.drain()
    await run
    expect(lane.peak()).toBe(UPLOAD_CONCURRENCY)
  })

  it('completes all 200, one outcome each, in the order the files were given', async () => {
    const files = harvest(FILES)
    const lane = releasable()
    const run = uploadFiles(files, lane.send)
    await lane.drain()
    const outcomes = await run
    expect(outcomes).toHaveLength(FILES)
    expect(outcomes.map((one) => one.path)).toEqual(files.map((one) => one.path))
    expect(outcomes.every((one) => one.ok)).toBe(true)
  })

  it('uploads each file exactly once, so nothing is staged twice or skipped', async () => {
    const files = harvest(FILES)
    const lane = releasable()
    const run = uploadFiles(files, lane.send)
    await lane.drain()
    await run
    expect([...lane.started].sort()).toEqual([...files.map((one) => one.path)].sort())
  })
})

describe('a bound of one fails the same checks, which is what keeps them honest', () => {
  it('observes one in flight, not the bound, when the limit is one', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(FILES), lane.send, 1)
    await tick()
    expect(lane.inFlight()).toBe(1)
    expect(lane.inFlight()).not.toBe(UPLOAD_CONCURRENCY)
    await lane.drain()
    await run
  })

  it('observes every file in flight, not the bound, when there is no bound at all', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(FILES), lane.send, FILES)
    await tick()
    expect(lane.inFlight()).toBe(FILES)
    expect(lane.inFlight()).not.toBe(UPLOAD_CONCURRENCY)
    await lane.drain()
    await run
  })
})

describe('one refused file is reported against that file and ends nothing', () => {
  it('reports the refusal on its own row and stages every other file', async () => {
    const files = harvest(10)
    const lane = releasable([3])
    const run = uploadFiles(files, lane.send)
    await lane.drain()
    const outcomes = await run
    expect(outcomes).toHaveLength(10)
    expect(outcomes.filter((one) => !one.ok)).toHaveLength(1)
    const refused = outcomes.find((one) => !one.ok)
    expect(refused?.ok).toBe(false)
    expect(outcomes.filter((one) => one.ok)).toHaveLength(9)
  })

  it('carries the reason, so the sentence shown against a file is that file own', async () => {
    const lane = releasable([0])
    const run = uploadFiles(harvest(3), lane.send)
    await lane.drain()
    const outcomes = await run
    const refused = outcomes[0]
    expect(refused?.ok).toBe(false)
    expect(refused?.ok === false ? String(refused.reason) : '').toContain('refused drop/tasks/000.json')
  })

  it('reports every file as refused when every one of them is', async () => {
    const lane = releasable([0, 1, 2, 3, 4])
    const run = uploadFiles(harvest(5), lane.send)
    await lane.drain()
    const outcomes = await run
    expect(outcomes.filter((one) => !one.ok)).toHaveLength(5)
  })
})

describe('the degenerate drops are not a special case', () => {
  it('uploads nothing and answers nothing for an empty harvest', async () => {
    const lane = releasable()
    expect(await uploadFiles([], lane.send)).toEqual([])
    expect(lane.started).toEqual([])
  })

  it('uploads a single file without waiting for a lane that will never fill', async () => {
    const lane = releasable()
    const run = uploadFiles(harvest(1), lane.send)
    await tick()
    expect(lane.inFlight()).toBe(1)
    await lane.drain()
    expect(await run).toHaveLength(1)
  })
})
