import type { Clock, IdGenerator } from '@repo/kernel'

/** A clock frozen at one instant, so a test can assert on a stamp it chose. */
export const fixedClock = (at: string): Clock => ({ now: () => at })

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Ids that are distinct, ULID-shaped, and reproducible from a seed. */
export function sequentialIds(seed = 1): IdGenerator {
  let counter = seed
  const next = (prefix: string): string => {
    counter += 1
    let out = ''
    for (const char of `${prefix}${String(counter).padStart(6, '0')}`) {
      out += B32[char.charCodeAt(0) % 32] ?? '0'
    }
    return out.padEnd(26, '0').slice(0, 26)
  }
  return {
    entityId: () => next('E'),
    token: () => {
      counter += 1
      return `tok_${String(counter).padStart(16, '0')}`
    },
  }
}
