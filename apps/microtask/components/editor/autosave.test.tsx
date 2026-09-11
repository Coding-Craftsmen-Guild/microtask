import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentValue } from '@repo/contracts'
import { MAX_DOCUMENT_BYTES } from '@repo/contracts'
import { Autosave, KEEPALIVE_MAX_BYTES, SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from './autosave'
import type { SaveOutcome, SaveRequest, SaveState } from './save-document'

const text = (value: string): DocumentValue => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
})

interface Harness {
  readonly autosave: Autosave
  readonly requests: SaveRequest[]
  readonly states: SaveState[]
  answer: (outcome: SaveOutcome) => void
}

const SAVED: SaveOutcome = { kind: 'saved', updatedAt: 'v2' }
const FAILED: SaveOutcome = { kind: 'failed', message: 'Network down' }
const CONFLICT: SaveOutcome = { kind: 'conflict' }

const harness = (): Harness => {
  const requests: SaveRequest[] = []
  const states: SaveState[] = []
  let outcome: SaveOutcome = SAVED
  const autosave = new Autosave({
    updatedAt: 'v1',
    save: (request) => {
      requests.push(request)
      return Promise.resolve(outcome)
    },
    onState: (state) => states.push(state),
  })
  return {
    autosave,
    requests,
    states,
    answer: (next) => {
      outcome = next
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the measured legacy timings', () => {
  it('debounces 700ms and retries 4000ms, and says so in named constants', () => {
    expect(SAVE_DEBOUNCE_MS).toBe(700)
    expect(SAVE_RETRY_MS).toBe(4000)
  })

  it('keeps the keepalive body well under the 64 KiB the budget caps at', () => {
    expect(KEEPALIVE_MAX_BYTES).toBe(50_000)
    expect(KEEPALIVE_MAX_BYTES).toBeLessThan(64 * 1024)
    expect(KEEPALIVE_MAX_BYTES).toBeLessThan(MAX_DOCUMENT_BYTES)
  })
})

describe('the debounce', () => {
  it('says Saving the moment a change arrives, before anything is sent', () => {
    const { autosave, requests, states } = harness()
    autosave.change(text('a'))
    expect(states).toEqual(['saving'])
    expect(requests).toEqual([])
  })

  it('has still sent nothing one millisecond short of the window', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1)
    expect(requests).toEqual([])
  })

  it('writes once the window closes, conditional on the stamp it was given', async () => {
    const { autosave, requests, states } = harness()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(requests).toEqual([{ document: text('a'), ifMatch: 'v1', keepalive: false }])
    expect(states).toEqual(['saving', 'saved'])
  })

  it('re-arms rather than queues, so a burst of typing is one write of the last document', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(600)
    autosave.change(text('ab'))
    await vi.advanceTimersByTimeAsync(600)
    expect(requests).toEqual([])
    await vi.advanceTimersByTimeAsync(100)
    expect(requests.map((request) => request.document)).toEqual([text('ab')])
  })

  it('carries the stamp the previous write answered with into the next one', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.change(text('ab'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(requests.map((request) => request.ifMatch)).toEqual(['v1', 'v2'])
    expect(autosave.updatedAt).toBe('v2')
  })
})

describe('typing during an in-flight save', () => {
  it('never produces a false Saved, dirty being cleared before the await and set again', async () => {
    const requests: SaveRequest[] = []
    const states: SaveState[] = []
    let release: (outcome: SaveOutcome) => void = () => undefined
    const autosave = new Autosave({
      updatedAt: 'v1',
      save: (request) => {
        requests.push(request)
        return new Promise<SaveOutcome>((resolve) => {
          release = resolve
        })
      },
      onState: (state) => states.push(state),
    })
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(requests.length).toBe(1)
    autosave.change(text('ab'))
    release(SAVED)
    await vi.advanceTimersByTimeAsync(0)
    expect(states).toEqual(['saving', 'saving'])
    expect(autosave.state).toBe('saving')
    expect(autosave.dirty).toBe(true)
  })
})

describe('a failed write', () => {
  it('says it is retrying and sends the same document again 4000ms later', async () => {
    const { autosave, requests, states, answer } = harness()
    answer(FAILED)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(states).toEqual(['saving', 'retrying'])
    expect(autosave.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS)
    expect(requests.length).toBe(2)
    expect(requests[1]).toEqual({ document: text('a'), ifMatch: 'v1', keepalive: false })
  })

  it('retries indefinitely without stacking a timer per failure', async () => {
    const { autosave, requests, answer } = harness()
    answer(FAILED)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    for (let attempt = 2; attempt <= 6; attempt += 1) {
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS)
      expect(requests.length).toBe(attempt)
    }
  })

  it('recovers to Saved once a retry lands', async () => {
    const { autosave, states, answer } = harness()
    answer(FAILED)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    answer(SAVED)
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS)
    expect(states).toEqual(['saving', 'retrying', 'saved'])
    expect(autosave.updatedAt).toBe('v2')
  })

  it('keeps the message the server gave, so the surface can show it', async () => {
    const { autosave, answer } = harness()
    answer(FAILED)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(autosave.message).toBe('Network down')
  })
})

describe('a 409 is surfaced and never retried', () => {
  it('goes to conflict rather than retrying, which would loop forever', async () => {
    const { autosave, requests, states, answer } = harness()
    answer(CONFLICT)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(states).toEqual(['saving', 'conflict'])
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS * 10)
    expect(requests.length).toBe(1)
  })

  it('stops writing but keeps the edits, so nothing is discarded before the user is told', async () => {
    const { autosave, requests, answer } = harness()
    answer(CONFLICT)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.change(text('ab'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    expect(requests.length).toBe(1)
    expect(autosave.state).toBe('conflict')
    expect(autosave.dirty).toBe(true)
  })
})

describe('markClean, which is what stops a queued save resurrecting a deleted tab', () => {
  it('cancels the pending write outright', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    autosave.markClean()
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    expect(requests).toEqual([])
    expect(autosave.dirty).toBe(false)
  })

  it('leaves an explicit flush with nothing to write', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    autosave.markClean()
    await autosave.flush()
    expect(requests).toEqual([])
  })

  it('clears the indicator, the way legacy blanked it on every tab switch', () => {
    const { autosave, states } = harness()
    autosave.change(text('a'))
    autosave.markClean()
    expect(states).toEqual(['saving', 'idle'])
  })
})

describe('an explicit flush', () => {
  it('writes immediately rather than waiting out the debounce', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await autosave.flush()
    expect(requests.length).toBe(1)
  })

  it('writes nothing when there is nothing dirty', async () => {
    const { autosave, requests } = harness()
    await autosave.flush()
    expect(requests).toEqual([])
  })

  it('cancels the debounce it overtakes, so one edit is never written twice', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await autosave.flush()
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2)
    expect(requests.length).toBe(1)
  })
})

describe('the keepalive size branch', () => {
  const big = (): DocumentValue => text('x'.repeat(KEEPALIVE_MAX_BYTES))

  it('sends a small document with keepalive set', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    await autosave.flush(true)
    expect(requests.map((request) => request.keepalive)).toEqual([true])
  })

  it('attempts nothing at all above the cap, an over-budget keepalive being a network error', async () => {
    const { autosave, requests } = harness()
    autosave.change(big())
    await autosave.flush(true)
    expect(requests).toEqual([])
    expect(autosave.dirty).toBe(true)
  })

  it('still writes the same document without keepalive, the cap being the budget and not the document', async () => {
    const { autosave, requests } = harness()
    autosave.change(big())
    await autosave.flush(false)
    expect(requests.length).toBe(1)
    expect(requests[0]?.keepalive).toBe(false)
  })

  it('measures the body in UTF-8 bytes, not UTF-16 code units', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('\u{1f600}'.repeat(KEEPALIVE_MAX_BYTES / 3)))
    await autosave.flush(true)
    expect(requests).toEqual([])
  })

  it('sends a body one byte under the cap and refuses one exactly at it, the ADR saying under', async () => {
    const body = (length: number): DocumentValue => text('x'.repeat(length))
    const bytes = (document_: DocumentValue): number =>
      new TextEncoder().encode(JSON.stringify(document_)).length
    const atCap = KEEPALIVE_MAX_BYTES - bytes(body(0))
    expect(bytes(body(atCap))).toBe(KEEPALIVE_MAX_BYTES)
    const under = harness()
    under.autosave.change(body(atCap - 1))
    await under.autosave.flush(true)
    expect(under.requests.length).toBe(1)
    const at = harness()
    at.autosave.change(body(atCap))
    await at.autosave.flush(true)
    expect(at.requests).toEqual([])
  })
})

describe('dispose', () => {
  it('cancels a pending write, so an unmounted editor stops saving', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('a'))
    autosave.dispose()
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    expect(requests).toEqual([])
  })

  it('cancels a pending retry too', async () => {
    const { autosave, requests, answer } = harness()
    answer(FAILED)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.dispose()
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS * 10)
    expect(requests.length).toBe(1)
  })
})

describe('one write at a time, so the loop can never conflict with itself', () => {
  const gated = () => {
    const requests: SaveRequest[] = []
    const states: SaveState[] = []
    const releases: ((outcome: SaveOutcome) => void)[] = []
    const autosave = new Autosave({
      updatedAt: 'v1',
      save: (request) => {
        requests.push(request)
        return new Promise<SaveOutcome>((resolve) => releases.push(resolve))
      },
      onState: (state) => states.push(state),
    })
    return { autosave, requests, states, releases }
  }

  it('holds the next write until the one in flight answers, then sends it on the new stamp', async () => {
    const { autosave, requests, releases } = gated()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.change(text('ab'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3)
    expect(requests.length).toBe(1)
    releases[0]?.({ kind: 'saved', updatedAt: 'v2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(requests.map((request) => request.ifMatch)).toEqual(['v1', 'v2'])
    expect(requests[1]?.document).toEqual(text('ab'))
  })

  it('queues an explicit flush behind the write in flight instead of racing it', async () => {
    const { autosave, requests, releases } = gated()
    autosave.change(text('a'))
    void autosave.flush()
    autosave.change(text('ab'))
    void autosave.flush()
    expect(requests.length).toBe(1)
    releases[0]?.({ kind: 'saved', updatedAt: 'v2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(requests.map((request) => request.ifMatch)).toEqual(['v1', 'v2'])
  })

  it('reports nothing for a write markClean overtook, so a deleted tab is not retried forever', async () => {
    const { autosave, requests, states, releases } = gated()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.markClean()
    releases[0]?.({ kind: 'failed', message: 'Not found' })
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS * 5)
    expect(requests.length).toBe(1)
    expect(states.at(-1)).toBe('idle')
    expect(autosave.dirty).toBe(false)
  })

  it('still takes the stamp from a write markClean overtook, since the server did store it', async () => {
    const { autosave, releases } = gated()
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.markClean()
    releases[0]?.({ kind: 'saved', updatedAt: 'v2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(autosave.updatedAt).toBe('v2')
  })
})

describe('the paths that must not lose the debounce', () => {
  it('leaves the debounce armed after an over-budget keepalive attempt, so staying on the page still saves', async () => {
    const { autosave, requests } = harness()
    autosave.change(text('x'.repeat(KEEPALIVE_MAX_BYTES)))
    await autosave.flush(true)
    expect(requests).toEqual([])
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(requests.map((request) => request.keepalive)).toEqual([false])
  })

  it('writes nothing on an explicit flush during a conflict, which would only earn another 409', async () => {
    const { autosave, requests, answer } = harness()
    answer(CONFLICT)
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    autosave.change(text('ab'))
    await autosave.flush()
    await autosave.flush(true)
    expect(requests.length).toBe(1)
  })

  it('treats a save that throws as a failed one, rather than dropping the edit as saved', async () => {
    const requests: SaveRequest[] = []
    const states: SaveState[] = []
    const autosave = new Autosave({
      updatedAt: 'v1',
      save: (request) => {
        requests.push(request)
        return Promise.reject(new TypeError('Failed to fetch'))
      },
      onState: (state) => states.push(state),
    })
    autosave.change(text('a'))
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(states).toEqual(['saving', 'retrying'])
    expect(autosave.dirty).toBe(true)
    expect(autosave.message).toBe('Failed to fetch')
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS)
    expect(requests.length).toBe(2)
  })
})
