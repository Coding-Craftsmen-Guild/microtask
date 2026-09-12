import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Editor as CoreEditor, type Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { countTasks, type DocumentValue, type ProgressValue } from '@repo/contracts'
import { SAVE_DEBOUNCE_MS } from './autosave'
import { DocumentEditor, type DocumentEditorHandle } from './document-editor'
import { buildExtensions } from './extensions'
import type { SaveOutcome, SaveRequest } from './save-document'

const FIXTURES = join(import.meta.dirname, '../../../../packages/contracts/src/testing')

interface StoredTab {
  readonly name: string
  readonly updatedAt: string
  readonly document: DocumentValue
}

const stored = (file: string): readonly StoredTab[] =>
  (JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as { tabs: readonly StoredTab[] }).tabs

const EVERY = [
  ...stored('legacy-project.fixture.json'),
  ...stored('legacy-project-2.fixture.json'),
]

const checklist = (): StoredTab => {
  const found = EVERY.find(
    (candidate) =>
      ((candidate.document.content ?? []).at(-1) as { type?: string } | undefined)?.type === 'taskList',
  )
  if (found === undefined) throw new Error('no stored tab ends in a taskList any more')
  return found
}

const headText = (source: StoredTab): string =>
  String(
    ((source.document.content?.[0] as { content?: readonly { text?: string }[] } | undefined)?.content ??
      [])[0]?.text,
  )

const typedAtThree = (source: StoredTab): string => {
  const head = headText(source)
  return JSON.stringify(source.document).replace(head, `${head.slice(0, 2)}Z${head.slice(2)}`)
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

const clickInto = (editor: Editor): void => {
  act(() => {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)))
  })
}

describe('THE test: a stored production document survives mount and unmount untouched', () => {
  it.each(EVERY.map((each, index) => [index, each] as const))(
    'holds stored tab %i byte-identically, editable, through a click that types nothing, and writes nothing',
    async (_index, source) => {
      const { editor, view } = await mount(source, true)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
      clickInto(editor)
      await settle(SAVE_DEBOUNCE_MS * 20)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
      view.unmount()
      await settle(SAVE_DEBOUNCE_MS * 20)
      expect(requests).toEqual([])
      expect(progress).toEqual([])
    },
  )

  it.each(EVERY.map((each, index) => [index, each] as const))(
    'holds stored tab %i byte-identically when read-only, through a click, too',
    async (_index, source) => {
      const { editor } = await mount(source, false)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
      clickInto(editor)
      expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(source.document))
    },
  )

  it('clicks through the transaction pipeline, which is where TrailingNode acts on a document', async () => {
    const { editor } = await mount(checklist(), true)
    const seen: boolean[] = []
    editor.on('transaction', ({ transaction }) => seen.push(transaction.selectionSet))
    clickInto(editor)
    expect(seen).toEqual([true])
  })
})

describe('the first keystroke is the users own', () => {
  it('writes exactly what was typed into a tab ending in a taskList, and nothing it did not', async () => {
    const { editor } = await mount(checklist())
    act(() => {
      editor.chain().setTextSelection(3).insertContent('Z').run()
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests.length).toBe(1)
    const written = requests[0]?.document
    expect(written?.content?.length).toBe(2)
    expect(JSON.stringify(written)).toBe(
      typedAtThree(checklist()),
    )
  })

  it('makes that write conditional on the stamp the tab was loaded with', async () => {
    const { editor } = await mount(checklist())
    act(() => {
      editor.commands.insertContent('Z')
    })
    await settle(SAVE_DEBOUNCE_MS)
    expect(requests[0]?.ifMatch).toBe(checklist().updatedAt)
  })
})

describe('progress', () => {
  it('reports the live count after an edit, through the same countTasks the server uses', async () => {
    const { editor } = await mount(checklist())
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
    const { surface, editor } = await mount(checklist(), false)
    const box = surface.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (box === null) throw new Error('no checkbox rendered')
    expect(box.checked).toBe(true)
    act(() => {
      box.checked = false
      box.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(box.checked).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(checklist().document))
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests).toEqual([])
  })

  it('marks every checkbox disabled, so assistive technology says it cannot be ticked, and a click sends nothing', async () => {
    const { surface, editor } = await mount(checklist(), false)
    const boxes = [...surface.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.length).toBe(6)
    expect(boxes.every((box) => box.disabled)).toBe(true)
    expect(screen.getAllByRole('checkbox').every((box) => box.matches(':disabled'))).toBe(true)
    await userEvent.click(boxes[0] as HTMLInputElement)
    expect(boxes[0]?.checked).toBe(true)
    expect(JSON.stringify(editor.getJSON())).toBe(JSON.stringify(checklist().document))
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests).toEqual([])
  })

  it('leaves every checkbox of an editable view enabled, including one added after mount', async () => {
    const { surface, editor } = await mount(checklist(), true)
    act(() => {
      editor.chain().setTextSelection(3).toggleTaskList().run()
    })
    const boxes = [...surface.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(boxes.length).toBeGreaterThan(6)
    expect(boxes.some((box) => box.disabled)).toBe(false)
  })

  it('carries the read-only surface props, spellcheck off and checkboxes dimmed, which an editable one does not', async () => {
    const readOnly = (await mount(checklist(), false)).surface
    expect(readOnly.getAttribute('spellcheck')).toBe('false')
    expect(readOnly.classList.contains('caret-transparent')).toBe(true)
    cleanup()
    const editable = (await mount(checklist(), true)).surface
    expect(editable.getAttribute('spellcheck')).toBe('true')
    expect(editable.classList.contains('caret-transparent')).toBe(false)
  })

  it('leaves Ctrl+S and Cmd+S to the browser, having nothing of its own to save', async () => {
    await mount(checklist(), false)
    const keys = [
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }),
      new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true }),
    ]
    act(() => {
      for (const key of keys) window.dispatchEvent(key)
    })
    expect(keys.map((key) => key.defaultPrevented)).toEqual([false, false])
  })

  it('draws no toolbar and no save state, and is not contenteditable', async () => {
    const { surface } = await mount(checklist(), false)
    expect(screen.queryByRole('toolbar')).toBe(null)
    expect(screen.queryByRole('status')).toBe(null)
    expect(surface.getAttribute('contenteditable')).toBe('false')
  })
})

describe('an editable view', () => {
  it('does not take focus on mount, which would scroll the page to it', async () => {
    const { editor } = await mount(checklist())
    await settle(100)
    expect(editor.view.hasFocus()).toBe(false)
  })

  it('takes Ctrl+S from the browser, so it saves the tab rather than the page', async () => {
    const { editor } = await mount(checklist())
    act(() => {
      editor.commands.insertContent('Z')
    })
    const key = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })
    act(() => {
      window.dispatchEvent(key)
    })
    expect(key.defaultPrevented).toBe(true)
    expect(requests.length).toBe(1)
  })

  it('pads the document 26px, stepping to 16px on a phone as legacy’s 640px query did, with a sticky toolbar', async () => {
    const { surface } = await mount(checklist())
    const content = surface.parentElement
    expect(content?.className.split(' ')).toEqual(expect.arrayContaining(['px-[26px]', 'max-sm:px-4']))
    expect(screen.getByRole('toolbar').parentElement?.className.split(' ')).toEqual(
      expect.arrayContaining(['sticky', 'top-0', 'flex-wrap']),
    )
  })

  it('draws the toolbar and the save state, and is contenteditable', async () => {
    const { surface } = await mount(checklist())
    expect(screen.getByRole('toolbar')).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(surface.getAttribute('contenteditable')).toBe('true')
  })

  it('ticks a checkbox as a normal transaction, which autosaves', async () => {
    const { surface } = await mount(checklist())
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
    await mount(checklist())
    act(() => {
      screen.getByTitle('Link').click()
    })
    expect(screen.getByText('Add link')).toBeTruthy()
  })
})

describe('leaving a tab, and deleting one', () => {
  it('writes now when a caller awaits flush before switching, so no edit is lost by navigating', async () => {
    const { editor, handle } = await mount(checklist())
    act(() => {
      editor.commands.insertContent('Z')
    })
    await act(async () => {
      await handle.current?.flush()
    })
    expect(requests.length).toBe(1)
  })

  it('writes a pending edit once when unmounted mid-debounce, which a switch by key does', async () => {
    const { editor, view } = await mount(checklist())
    act(() => {
      editor.commands.insertContent('Z')
    })
    view.unmount()
    await settle(SAVE_DEBOUNCE_MS * 5)
    expect(requests.length).toBe(1)
  })

  it('writes nothing after markClean, so a queued save cannot resurrect a deleted tab', async () => {
    const { editor, view, handle } = await mount(checklist())
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
    const { editor } = await mount(checklist())
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
    const { editor } = await mount(checklist())
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

  const click = (editor: Editor, anchor: Element): boolean => {
    const event = new MouseEvent('click', { bubbles: true, button: 0 })
    anchor.dispatchEvent(event)
    const position = editor.view.posAtDOM(anchor, 0)
    return editor.view.someProp('handleClick', (handle) => handle(editor.view, position, event)) === true
  }

  const anchorOf = (surface: Element): Element => {
    const anchor = surface.querySelector('a')
    if (anchor === null) throw new Error('no anchor rendered')
    return anchor
  }

  it('does not open a link clicked in an editable view, which only places the caret', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { surface, editor } = await mount(LINKED, true)
    expect(click(editor, anchorOf(surface))).toBe(false)
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('drives the real Link click handler, which opens the link once openOnClick is on', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new CoreEditor({
      element,
      extensions: buildExtensions(false),
      content: LINKED.document as object,
      editable: true,
    })
    expect(click(editor, anchorOf(editor.view.dom))).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank')
    editor.destroy()
    open.mockRestore()
  })

  it('leaves a read-only click to the browser, the handler bailing on a view that is not editable', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { surface, editor } = await mount(LINKED, false)
    expect(click(editor, anchorOf(surface))).toBe(false)
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
