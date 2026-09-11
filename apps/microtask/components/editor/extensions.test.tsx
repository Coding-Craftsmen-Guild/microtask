import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TrailingNode } from '@tiptap/extensions'
import { countTasks, type DocumentValue } from '@repo/contracts'
import { buildExtensions, editorProps, PLACEHOLDER } from './extensions'

const DATA = join(import.meta.dirname, '../../../../data/projects')

interface StoredTab {
  readonly name: string
  readonly document: DocumentValue
}

const stored = (file: string): readonly StoredTab[] =>
  (JSON.parse(readFileSync(join(DATA, file), 'utf8')) as { tabs: readonly StoredTab[] }).tabs

const PRODUCTION = ['01M240ERCRWWCN16Q5AHP1FZAQ.json', '01M240FB4GD6PF6V0PKZVF6FD9.json'] as const

const every = (): readonly StoredTab[] => PRODUCTION.flatMap((file) => [...stored(file)])

const live: Editor[] = []

const mount = (document_: unknown, editable = true): Editor => {
  const element = globalThis.document.createElement('div')
  globalThis.document.body.append(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions(editable),
    editorProps: editorProps(editable),
    content: document_ as object,
    editable,
    autofocus: false,
  })
  live.push(editor)
  return editor
}

const rootChildren = (editor: Editor): number => editor.state.doc.childCount

const named = (editor: Editor, name: string): number =>
  editor.extensionManager.extensions.filter((extension) => extension.name === name).length

const optionsOf = (editor: Editor, name: string): Record<string, unknown> =>
  (editor.extensionManager.extensions.find((extension) => extension.name === name)?.options ??
    {}) as Record<string, unknown>

afterEach(() => {
  while (live.length > 0) live.pop()?.destroy()
  globalThis.document.body.replaceChildren()
})

describe('a stored production document survives Tiptap 3', () => {
  it('round-trips byte-identically through mount and unmount with no edit', () => {
    for (const tab of every()) {
      const before = JSON.stringify(tab.document)
      const editor = mount(tab.document)
      const mounted = JSON.stringify(editor.getJSON())
      editor.destroy()
      expect([tab.name, mounted]).toEqual([tab.name, before])
    }
  })

  it('reads the real files rather than a fixture that happens to agree', () => {
    expect(every().length).toBe(5)
    const raw = PRODUCTION.map((file) => readFileSync(join(DATA, file), 'utf8')).join('')
    expect(raw).toContain('"taskItem"')
    expect(raw).toContain('"checked": true')
  })

  it('counts the same twelve checked items before and after mounting', () => {
    const sum = (documents: readonly unknown[]): [number, number] =>
      documents.reduce<[number, number]>(
        (total, document_) => {
          const { done, total: all } = countTasks(document_)
          return [total[0] + done, total[1] + all]
        },
        [0, 0],
      )
    const tabs = every()
    expect(sum(tabs.map((tab) => tab.document))).toEqual([12, 12])
    expect(sum(tabs.map((tab) => mount(tab.document).getJSON()))).toEqual([12, 12])
  })

  it('round-trips the underline mark Tiptap 3 adds and Tiptap 2 had no concept of', () => {
    const underlined = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: 'Sign' }],
        },
      ],
    }
    expect(JSON.stringify(mount(underlined).getJSON())).toBe(JSON.stringify(underlined))
  })
})

describe('trailingNode is off, so the first transaction is the users own', () => {
  const checklist = (): DocumentValue => {
    const tab = stored(PRODUCTION[0]).find((candidate) => candidate.name === 'Go-live')
    if (tab === undefined) throw new Error('the Go-live tab is gone')
    return tab.document
  }

  it('confirms the tab this guards really does end in a taskList', () => {
    const content = checklist().content ?? []
    expect((content.at(-1) as { type: string }).type).toBe('taskList')
  })

  it('leaves the root child count alone across a transaction', () => {
    const editor = mount(checklist())
    expect(rootChildren(editor)).toBe(2)
    editor.commands.insertContent('Z')
    expect(rootChildren(editor)).toBe(2)
  })

  it('grows the document the moment TrailingNode is back, which is what makes that a test', () => {
    const element = globalThis.document.createElement('div')
    const editor = new Editor({
      element,
      extensions: [...buildExtensions(true), TrailingNode],
      content: checklist() as object,
    })
    live.push(editor)
    expect(rootChildren(editor)).toBe(2)
    editor.commands.insertContent('Z')
    expect(rootChildren(editor)).toBe(3)
  })
})

describe('the extension set itself', () => {
  it('registers link exactly once, StarterKit 3 bundling it', () => {
    expect(named(mount({ type: 'doc' }), 'link')).toBe(1)
  })

  it('opens a link on click only where the document is not editable', () => {
    expect(optionsOf(mount({ type: 'doc' }, false), 'link')['openOnClick']).toBe(true)
    expect(optionsOf(mount({ type: 'doc' }, true), 'link')['openOnClick']).toBe(false)
  })

  it('keeps autolink, linkOnPaste and the rel that stops a tabnabbing link', () => {
    const options = optionsOf(mount({ type: 'doc' }), 'link')
    expect(options['autolink']).toBe(true)
    expect(options['linkOnPaste']).toBe(true)
    expect(options['HTMLAttributes']).toMatchObject({
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    })
  })

  it('nests task items and configures no onReadOnlyChecked, so a read-only tick snaps back', () => {
    const options = optionsOf(mount({ type: 'doc' }, false), 'taskItem')
    expect(options['nested']).toBe(true)
    expect(options['onReadOnlyChecked']).toBeUndefined()
  })

  it('offers three heading levels and no fourth', () => {
    expect(optionsOf(mount({ type: 'doc' }), 'heading')['levels']).toEqual([1, 2, 3])
  })

  it('turns spellcheck off in a read-only view and on in an editable one', () => {
    expect(mount({ type: 'doc' }, true).view.dom.getAttribute('spellcheck')).toBe('true')
    expect(mount({ type: 'doc' }, false).view.dom.getAttribute('spellcheck')).toBe('false')
  })

  it('keeps undoRedo, the extension a transcribed `history` key would silently drop', () => {
    expect(named(mount({ type: 'doc' }), 'undoRedo')).toBe(1)
  })

  it('shows the placeholder only where there is something to write into', () => {
    expect(optionsOf(mount({ type: 'doc' }, true), 'placeholder')['placeholder']).toBe(PLACEHOLDER)
    expect(optionsOf(mount({ type: 'doc' }, false), 'placeholder')['placeholder']).toBe('')
  })

  it('promises nothing the editor cannot do, the legacy placeholder having advertised `/`', () => {
    expect(PLACEHOLDER).not.toContain('/')
    expect(PLACEHOLDER).toContain('checklist')
  })

  it('spells no checklist toggle of its own, taskList coming from the list package', () => {
    const editor = mount({ type: 'doc' })
    expect(named(editor, 'taskList')).toBe(1)
    expect(named(editor, 'taskItem')).toBe(1)
  })
})
