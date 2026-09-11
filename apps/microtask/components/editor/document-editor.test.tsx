import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { renderToString } from 'react-dom/server'
import type { Editor } from '@tiptap/core'
import { countTasks, type DocumentValue, type ProgressValue } from '@repo/contracts'
import { SAVE_DEBOUNCE_MS } from './autosave'
import { DocumentEditor, type DocumentEditorHandle } from './document-editor'
import type { SaveOutcome, SaveRequest } from './save-document'

const DATA = join(import.meta.dirname, '../../../../data/projects')

interface StoredTab {
  readonly name: string
  readonly updatedAt: string
  readonly document: DocumentValue
}

const stored = (file: string): readonly StoredTab[] =>
  (JSON.parse(readFileSync(join(DATA, file), 'utf8')) as { tabs: readonly StoredTab[] }).tabs

const EVERY = [
  ...stored('01M240ERCRWWCN16Q5AHP1FZAQ.json'),
  ...stored('01M240FB4GD6PF6V0PKZVF6FD9.json'),
]

const tab = (name: string): StoredTab => {
  const found = EVERY.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no stored tab named ${name}`)
  return found
}

let outcome: SaveOutcome = { kind: 'saved', updatedAt: 'next' }
const requests: SaveRequest[] = []
const progress: ProgressValue[] = []
const reloads = vi.fn()

const save = (request: SaveRequest): Promise<SaveOutcome> => {
  requests.push(request)
  return Promise.resolve(outcome)
}

const mount = async (source: StoredTab, editable = true, handle = createRef<DocumentEditorHandle>()) => {
  const view = await act(async () =>
    render(
      <DocumentEditor
        ref={handle}
        document={source.document}
        editable={editable}
        onProgress={(value) => progress.push(value)}
        onReload={reloads}
        save={save}
        updatedAt={source.updatedAt}
      />,
    ),
  )
  const surface = view.container.querySelector('.ProseMirror')
  if (surface === null) throw new Error('the editor never mounted')
  return { view, surface, handle, editor: (surface as unknown as { editor: Editor }).editor }
}

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  outcome = { kind: 'saved', updatedAt: 'next' }
  requests.length = 0
  progress.length = 0
  reloads.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('THE test: a stored production document survives mount and unmount untouched', () => {
  it.each(EVERY.map((each) => [each.name, each] as const))(
    'holds %s byte-identically, editable, and writes nothing',
    async (_name, source) => {
      const { editor, view } = await mount(source, true)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
      await settle(SAVE_DEBOUNCE_MS * 20)
      view.unmount()
      await settle(SAVE_DEBOUNCE_MS * 20)
      expect(requests).toEqual([])
      expect(progress).toEqual([])
    },
  )

  it.each(EVERY.map((each) => [each.name, each] as const))(
    'holds %s byte-identically when read-only, too',
    async (_name, source) => {
      const { editor } = await mount(source, false)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
    },
  )
})

describe('the first keystroke is the users own', () => {
  it('writes exactly what was typed into a tab ending in a taskList, and nothing it did not', async () => {
    const { editor } = await mount(tab('Go-live'))
    act(() => {
      editor.chain().setTextSelection(3).insertContent('Z').run()
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests.length).toBe(1)
    const written = requests[0]?.document
    expect(written?.content?.length).toBe(2)
    expect(JSON.stringify(written)).toBe(
      JSON.stringify(tab('Go-live').document).replace('GO-LIVE', 'GOZ-LIVE'),
    )
  })

  it('makes that write conditional on the stamp the tab was loaded with', async () => {
    const { editor } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests[0]?.ifMatch).toBe(tab('Go-live').updatedAt)
  })
})

describe('progress', () => {
  it('reports the live count after an edit, through the same countTasks the server uses', async () => {
    const { editor } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.command(({ tr }) => {
        let first = -1
        tr.doc.descendants((node, position) => {
          if (first === -1 && node.type.name === 'taskItem') first = position
        })
        tr.setNodeMarkup(first, undefined, { checked: false })
        return true
      })
    })
    expect(progress.at(-1)).toEqual({ done: 5, total: 6 })
    expect(progress.at(-1)).toEqual(countTasks(editor.getJSON()))
  })
})

describe('a read-only view', () => {
  it('snaps a clicked checkbox straight back, and neither edits nor saves', async () => {
    const { surface, editor } = await mount(tab('Go-live'), false)
    const box = surface.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (box === null) throw new Error('no checkbox rendered')
    expect(box.checked).toBe(true)
    act(() => {
      box.checked = false
      box.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(box.checked).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(tab('Go-live').document))
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests).toEqual([])
  })

  it('draws no toolbar and no save state, and is not contenteditable', async () => {
    const { surface } = await mount(tab('Go-live'), false)
    expect(screen.queryByRole('toolbar')).toBe(null)
    expect(screen.queryByRole('status')).toBe(null)
    expect(surface.getAttribute('contenteditable')).toBe('false')
  })
})

describe('an editable view', () => {
  it('draws the toolbar and the save state, and is contenteditable', async () => {
    const { surface } = await mount(tab('Go-live'))
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(surface.getAttribute('contenteditable')).toBe('true')
  })

  it('ticks a checkbox as a normal transaction, which autosaves', async () => {
    const { surface } = await mount(tab('Go-live'))
    const box = surface.querySelector<HTMLInputElement>('input[type="checkbox"]')
    act(() => {
      if (box === null) return
      box.checked = false
      box.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests.length).toBe(1)
    expect(countTasks(requests[0]?.document)).toEqual({ done: 5, total: 6 })
  })

  it('opens the link dialog from the toolbar', async () => {
    await mount(tab('Go-live'))
    act(() => {
      screen.getByTitle('Link').click()
    })
    expect(screen.getByText('Add link')).toBeTruthy()
  })
})

describe('leaving a tab, and deleting one', () => {
  it('writes now when a caller awaits flush before switching, so no edit is lost by navigating', async () => {
    const { editor, handle } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    await act(async () => {
      await handle.current?.flush()
    })
    expect(requests.length).toBe(1)
  })

  it('writes a pending edit once when unmounted mid-debounce, which a switch by key does', async () => {
    const { editor, view } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    view.unmount()
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests.length).toBe(1)
  })

  it('writes nothing after markClean, so a queued save cannot resurrect a deleted tab', async () => {
    const { editor, view, handle } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    act(() => {
      handle.current?.markClean()
    })
    view.unmount()
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests).toEqual([])
  })
})

describe('a conflict is surfaced, end to end', () => {
  it('shows someone else saved this tab, with a reload that is the users to choose', async () => {
    outcome = { kind: 'conflict' }
    const { editor } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(screen.getByRole('alert').textContent).toContain('Someone else saved this tab')
    expect(reloads).not.toHaveBeenCalled()
    act(() => {
      screen.getByRole('button', { name: 'Reload this tab' }).click()
    })
    expect(reloads).toHaveBeenCalledTimes(1)
  })

  it('shows the retry text on a failure instead', async () => {
    outcome = { kind: 'failed', message: 'Network down' }
    const { editor } = await mount(tab('Go-live'))
    act(() => {
      editor.commands.insertContent('Z')
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(screen.getByRole('status').textContent).toContain('Not saved — retrying…')
  })
})

describe('links, by view', () => {
  const LINKED: StoredTab = {
    name: 'linked',
    updatedAt: 'v1',
    document: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }], text: 'go' },
          ],
        },
      ],
    },
  }

  it('does not open a link clicked in an editable view, which only places the caret', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { surface } = await mount(LINKED, true)
    act(() => {
      surface.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
    })
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('renders a real, new-tab, no-opener anchor on a surface that is not editable', async () => {
    const { surface } = await mount(LINKED, false)
    const anchor = surface.querySelector('a')
    expect(surface.getAttribute('contenteditable')).toBe('false')
    expect(anchor?.getAttribute('href')).toBe('https://example.com')
    expect(anchor?.getAttribute('target')).toBe('_blank')
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer nofollow')
  })
})

describe('the App Router server pass', () => {
  it('renders without an editor rather than throwing, immediatelyRender being false', () => {
    const html = renderToString(
      <DocumentEditor
        document={tab('Go-live').document}
        editable
        onReload={() => undefined}
        save={save}
        updatedAt="v1"
      />,
    )
    expect(html).not.toContain('ProseMirror')
    expect(html).toContain('toolbar')
  })
})
