import { describe, expect, it } from 'vitest'
import { QueueLock } from './queue-lock.js'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('QueueLock', () => {
  it('runs work in the order it was submitted', async () => {
    const lock = new QueueLock()
    const order: string[] = []
    await Promise.all([
      lock.run(async () => {
        await wait(20)
        order.push('first')
      }),
      lock.run(async () => {
        order.push('second')
      }),
    ])
    expect(order).toEqual(['first', 'second'])
  })

  it('never overlaps two pieces of work', async () => {
    const lock = new QueueLock()
    let inside = 0
    let maxInside = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        lock.run(async () => {
          inside += 1
          maxInside = Math.max(maxInside, inside)
          await wait(1)
          inside -= 1
        }),
      ),
    )
    expect(maxInside).toBe(1)
  })

  it('keeps running later work after earlier work rejects', async () => {
    const lock = new QueueLock()
    const failed = lock.run(async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(lock.run(async () => 'fine')).resolves.toBe('fine')
  })

  it('returns the value the work produced', async () => {
    const lock = new QueueLock()
    await expect(lock.run(async () => 42)).resolves.toBe(42)
  })
})
