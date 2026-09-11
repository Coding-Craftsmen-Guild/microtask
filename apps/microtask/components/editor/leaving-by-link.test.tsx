import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import Link from 'next/link'
import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import type { DocumentValue } from '@repo/contracts'
import { SAVE_DEBOUNCE_MS, SAVE_RETRY_MS } from './autosave'
import { DocumentEditor } from './document-editor'
import { LEAVE_QUESTION } from './leave-guard'
import type { SaveOutcome, SaveRequest } from './save-document'

const DOCUMENT: DocumentValue = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checklist' }] }],
}

let outcome: SaveOutcome = { kind: 'saved', updatedAt: 'S2' }
let gate: Promise<void> | null = null
const requests: SaveRequest[] = []
const followed: string[] = []
let ask = vi.fn<(message?: string) => boolean>()

const save = (request: SaveRequest): Promise<SaveOutcome> => {
  requests.push(request)
  const answer = outcome
  return (gate ?? Promise.resolve()).then(() => answer)
}

const follow = (name: string, away: () => void) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
  followed.push(`${name}:${event.defaultPrevented ? 'prevented' : 'open'}`)
  event.preventDefault()
  away()
}

function TaskPage() {
  const [here, setHere] = useState(true)
  if (!here) {
    return (
      <Link href="/p/P1/t/T2" onClick={follow('next task', () => undefined)}>
        Next task
      </Link>
    )
  }
  return (
    <>
      <Link href="/p/P1" onClick={follow('back', () => setHere(false))}>
        ← Back to project
      </Link>
      <a href="/" onClick={follow('bar', () => undefined)}>
        Microtask
      </a>
      <DocumentEditor document={DOCUMENT} editable onReload={vi.fn()} save={save} updatedAt="S1" />
    </>
  )
}

const mount = async (): Promise<Editor> => {
  const view = await act(async () => render(<TaskPage />))
  const surface = view.container.querySelector('.ProseMirror')
  if (surface === null) throw new Error('the editor never mounted')
  return (surface as unknown as { editor: Editor }).editor
}

const type = (editor: Editor, text: string): void => {
  act(() => {
    editor.commands.insertContent(text)
  })
}

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const click = (name: string): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  act(() => {
    screen.getByRole('link', { name }).dispatchEvent(event)
  })
  return event
}

const unload = (): Event => {
  const event = new Event('beforeunload', { cancelable: true })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

const editorGone = (): boolean => document.querySelector('.ProseMirror') === null

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  window.history.replaceState(null, '', '/p/P1/t/T1?tab=a')
  outcome = { kind: 'saved', updatedAt: 'S2' }
  gate = null
  requests.length = 0
  followed.length = 0
  ask = vi.fn<(message?: string) => boolean>(() => false)
  vi.stubGlobal('confirm', ask)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('leaving the task page by an in-app link', () => {
  it('asks nothing and lets the link go once every edit is saved', async () => {
    const editor = await mount()
    type(editor, 'Z')
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests).toHaveLength(1)
    click('← Back to project')
    expect(ask).not.toHaveBeenCalled()
    expect(followed).toEqual(['back:open'])
    expect(editorGone()).toBe(true)
  })

  it('asks before a Next link leaves edits a conflict is holding, and staying keeps them on screen', async () => {
    outcome = { kind: 'conflict' }
    const editor = await mount()
    type(editor, 'Z')
    await settle(SAVE_DEBOUNCE_MS)
    expect(screen.getByRole('alert').textContent).toContain('Someone else saved this tab')
    const event = click('← Back to project')
    expect(ask).toHaveBeenCalledExactlyOnceWith(LEAVE_QUESTION)
    expect(event.defaultPrevented).toBe(true)
    expect(followed).toEqual([])
    expect(editorGone()).toBe(false)
    expect(editor.getText()).toContain('Z')
    expect(screen.getByRole('alert').textContent).toContain('Someone else saved this tab')
    expect(requests).toHaveLength(1)
  })

  it('asks while a failed save waits to retry, and staying lets the retry land the edit', async () => {
    outcome = { kind: 'failed', message: 'down' }
    const editor = await mount()
    type(editor, 'Z')
    await settle(SAVE_DEBOUNCE_MS)
    expect(screen.getByRole('status').textContent).toContain('Not saved — retrying…')
    click('← Back to project')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(followed).toEqual([])
    outcome = { kind: 'saved', updatedAt: 'S2' }
    await settle(SAVE_RETRY_MS)
    expect(requests.at(-1)?.document).toEqual(editor.getJSON())
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })

  it('asks inside the debounce window too, as unload does, since the edit is not stored yet', async () => {
    const editor = await mount()
    type(editor, 'Z')
    click('← Back to project')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(followed).toEqual([])
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests).toHaveLength(1)
  })

  it('asks for the app bar’s plain link too, and staying cancels the browser’s own navigation', async () => {
    outcome = { kind: 'conflict' }
    const editor = await mount()
    type(editor, 'Z')
    await settle(SAVE_DEBOUNCE_MS)
    const event = click('Microtask')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(followed).toEqual([])
  })

  it('lets the link go when the user chooses to leave', async () => {
    outcome = { kind: 'conflict' }
    ask.mockReturnValue(true)
    const editor = await mount()
    type(editor, 'Z')
    await settle(SAVE_DEBOUNCE_MS)
    click('← Back to project')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(followed).toEqual(['back:open'])
    expect(editorGone()).toBe(true)
  })

  it('does not ask again on the unload a chosen plain-link leave causes, and still flushes on it', async () => {
    ask.mockReturnValue(true)
    const editor = await mount()
    type(editor, 'Z')
    click('Microtask')
    expect(followed).toEqual(['bar:open'])
    const event = unload()
    expect(ask).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
    expect(requests.map((request) => request.keepalive)).toEqual([true])
  })

  it('asks again on the next link when a leave the user chose did not take the page away', async () => {
    ask.mockReturnValueOnce(true).mockReturnValue(false)
    const editor = await mount()
    type(editor, 'Z')
    click('Microtask')
    expect(followed).toEqual(['bar:open'])
    expect(editorGone()).toBe(false)
    click('← Back to project')
    expect(ask).toHaveBeenCalledTimes(2)
    expect(followed).toEqual(['bar:open'])
    expect(unload().defaultPrevented).toBe(true)
  })

  it('still asks for the browser’s prompt on unload after the user chose to stay', async () => {
    const editor = await mount()
    type(editor, 'Z')
    click('← Back to project')
    expect(unload().defaultPrevented).toBe(true)
  })

  it('stops asking once the editor is gone, even while its last write is still in flight', async () => {
    let release: () => void = () => undefined
    gate = new Promise((resolve) => (release = resolve))
    ask.mockReturnValue(true)
    const editor = await mount()
    type(editor, 'Z')
    click('← Back to project')
    expect(editorGone()).toBe(true)
    expect(requests).toHaveLength(1)
    click('Next task')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(followed).toEqual(['back:open', 'next task:open'])
    release()
  })
})
