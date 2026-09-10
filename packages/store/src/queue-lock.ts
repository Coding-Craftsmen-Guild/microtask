import type { Lock } from '@repo/kernel'

/** Serialises work through a single promise chain, in submission order. */
export class QueueLock implements Lock {
  #chain: Promise<unknown> = Promise.resolve()

  /** Runs `work` once no earlier work is outstanding. */
  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#chain.then(work, work)
    this.#chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
