import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { DocumentValue } from '@repo/contracts'
import { KEEPALIVE_MAX_BYTES, SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from './autosave'
import type { SaveOutcome, SaveRequest } from './save-document'
import { useAutosave, type AutosaveHandle } from './use-autosave'

const text = (value: string): DocumentValue => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
})

const requests: SaveRequest[] = []

const versions: number[] = []

let handle: AutosaveHandle | null = null

let failing = false

let gate: Promise<void> | null = null

const save = (request: SaveRequest): Promise<SaveOutcome> => {
  requests.push(request)
  const answer: SaveOutcome = failing
    ? { kind: 'failed', message: 'down' }
    : { kind: 'saved', updatedAt: 'v2' }
  return (gate ?? Promise.resolve()).then(() => answer)
}

function Probe({ version }: { version: number }) {
  handle = useAutosave({
    updatedAt: 'v1',
    save: (request) => {
      versions.push(version)
      return save(request)
    },
  })
  return <span data-testid="state">{handle.state}</span>
}

function Plain() {
  handle = useAutosave({ updatedAt: 'v1', save })
  return <span data-testid="state">{handle.state}</span>
}

const hide = (state: 'hidden' | 'visible'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

const unload = (): Event => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

const press = (key: string, meta: boolean): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: !meta, metaKey: meta, cancelable: true })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  vi.useFakeTimers()
  requests.length = 0
  versions.length = 0
  handle = null
  failing = false
  gate = null
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const mounted = (): AutosaveHandle => {
  if (handle === null) throw new Error('the probe never rendered')
  return handle
}

describe('the hook reports what the loop is doing', () => {
  it('renders idle, then saving, then saved as the write lands', async () => {
    const view = render(<Plain />)
    expect(view.getByTestId('state').textContent).toBe('idle')
    act(() => mounted().change(text('a')))
    expect(view.getByTestId('state').textContent).toBe('saving')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })
    expect(view.getByTestId('state').textContent).toBe('saved')
  })

  it('keeps one loop across a re-render whose save prop is a fresh closure', async () => {
    const view = render(<Probe version={1} />)
    act(() => mounted().change(text('a')))
    view.rerender(<Probe version={2} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    })
    expect(requests.length).toBe(1)
    expect(versions).toEqual([2])
  })
})

describe('the page going away', () => {
  it('flushes on visibilitychange to hidden without keepalive, which carries no size limit', () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    act(() => hide('hidden'))
    expect(requests.map((request) => request.keepalive)).toEqual([false])
  })

  it('flushes a document too large for keepalive on the hidden path, which is the point of it', () => {
    render(<Plain />)
    act(() => mounted().change(text('x'.repeat(KEEPALIVE_MAX_BYTES))))
    act(() => hide('hidden'))
    expect(requests.length).toBe(1)
  })

  it('does nothing when the page merely becomes visible again', () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    act(() => hide('visible'))
    expect(requests).toEqual([])
  })

  it('flushes with keepalive on beforeunload and asks for the native prompt', () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    const events: Event[] = []
    act(() => {
      events.push(unload())
    })
    expect(requests.map((request) => request.keepalive)).toEqual([true])
    expect(events[0]?.defaultPrevented).toBe(true)
  })

  it('leaves beforeunload alone when there is nothing unsaved, so a clean page just closes', () => {
    render(<Plain />)
    const events: Event[] = []
    act(() => {
      events.push(unload())
    })
    expect(requests).toEqual([])
    expect(events[0]?.defaultPrevented).toBe(false)
  })

  it('still asks for the prompt when the body is too large to send, rather than lying', () => {
    render(<Plain />)
    act(() => mounted().change(text('x'.repeat(KEEPALIVE_MAX_BYTES))))
    const events: Event[] = []
    act(() => {
      events.push(unload())
    })
    expect(requests).toEqual([])
    expect(events[0]?.defaultPrevented).toBe(true)
  })
})

describe('force save', () => {
  it('answers Ctrl+S and Cmd+S by writing now and suppressing the browser dialog', async () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    const events: KeyboardEvent[] = []
    act(() => {
      events.push(press('s', false))
    })
    expect(requests.length).toBe(1)
    expect(events[0]?.defaultPrevented).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    act(() => mounted().change(text('ab')))
    act(() => press('S', true))
    expect(requests.length).toBe(2)
  })

  it('ignores s without a modifier, which is a character someone is typing', () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    const event = new KeyboardEvent('keydown', { key: 's', cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(requests).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('unmounting', () => {
  it('writes a pending edit once, so leaving inside the debounce loses nothing', async () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    })
    expect(requests.map((request) => request.document)).toEqual([text('a')])
    expect(requests[0]?.keepalive).toBe(false)
  })

  it('writes nothing when there was nothing pending', async () => {
    render(<Plain />)
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    })
    expect(requests).toEqual([])
  })

  it('writes nothing after markClean, which is what stops a deleted tab coming back', async () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    act(() => mounted().markClean())
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 10)
    })
    expect(requests).toEqual([])
  })

  it('makes one attempt and no retry loop, since nothing is left on screen to report it', async () => {
    failing = true
    render(<Plain />)
    act(() => mounted().change(text('a')))
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_MS * 10)
    })
    expect(requests.length).toBe(1)
  })

  it('unhooks the page listeners, so a later unload writes nothing more', async () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const written = requests.length
    act(() => hide('hidden'))
    act(() => unload())
    act(() => press('s', false))
    expect(requests.length).toBe(written)
  })
})

describe('the flush a caller awaits before switching tab', () => {
  it('writes a document too large for keepalive, the page staying alive on that path', async () => {
    render(<Plain />)
    act(() => mounted().change(text('x'.repeat(KEEPALIVE_MAX_BYTES))))
    await act(async () => {
      await mounted().flush()
    })
    expect(requests.map((request) => request.keepalive)).toEqual([false])
  })

  it('hands back a promise that settles only once the write has', async () => {
    let release = (): void => undefined
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    render(<Plain />)
    act(() => mounted().change(text('a')))
    let settled = false
    const pending = mounted().flush().then(() => {
      settled = true
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(settled).toBe(false)
    release()
    await act(async () => {
      await pending
    })
    expect(settled).toBe(true)
  })

  it('writes now and resolves once the write has landed', async () => {
    render(<Plain />)
    act(() => mounted().change(text('a')))
    await act(async () => {
      await mounted().flush()
    })
    expect(requests.length).toBe(1)
    expect(mounted().state).toBe('saved')
  })
})
