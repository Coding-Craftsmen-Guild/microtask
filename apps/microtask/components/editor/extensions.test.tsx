import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { TrailingNode } from '@tiptap/extensions'
import { countTasks, type DocumentValue } from '@repo/contracts'
import { buildExtensions, editorProps, PLACEHOLDER } from './extensions'

const FIXTURES = join(import.meta.dirname, '../../../../packages/contracts/src/testing')
const DATA = join(import.meta.dirname, '../../../../data/projects')

interface StoredTab {
  readonly name: string
  readonly document: DocumentValue
}

const stored = (directory: string, file: string): readonly StoredTab[] =>
  (JSON.parse(readFileSync(join(directory, file), 'utf8')) as { tabs: readonly StoredTab[] }).tabs

const DERIVED = ['legacy-project.fixture.json', 'legacy-project-2.fixture.json'] as const

const PRODUCTION = ['01M240ERCRWWCN16Q5AHP1FZAQ.json', '01M240FB4GD6PF6V0PKZVF6FD9.json'] as const

const hasProduction = PRODUCTION.every((file) => existsSync(join(DATA, file)))

const every = (): readonly StoredTab[] => DERIVED.flatMap((file) => [...stored(FIXTURES, file)])

const production = (): readonly StoredTab[] => PRODUCTION.flatMap((file) => [...stored(DATA, file)])

const skeleton = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map((child) => skeleton(child))
  if (node === null || typeof node !== 'object') return node
  const record = node as Record<string, unknown>
  return { type: record['type'], attrs: record['attrs'], content: skeleton(record['content']) }
}

const shape = (tabs: readonly StoredTab[]): readonly unknown[] =>
  tabs.map((tab) => [countTasks(tab.document), skeleton(tab.document)])

const endsInTaskList = (document_: DocumentValue): boolean =>
  ((document_.content ?? []).at(-1) as { type?: string } | undefined)?.type === 'taskList'

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

  it('reads the five stored tabs, checked task items and all, off files a fresh clone has', () => {
    expect(every().length).toBe(5)
    const raw = DERIVED.map((file) => readFileSync(join(FIXTURES, file), 'utf8')).join('')
    expect(raw).toContain('"taskItem"')
    expect(raw).toContain('"checked": true')
  })

  it.skipIf(!hasProduction)('mounts what production holds, the fixtures agreeing tab for tab', () => {
    expect(shape(every())).toEqual(shape(production()))
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

describe('a stored link does not round-trip byte-identically, and what it gains is this app’s', () => {
  const LEGACY_HREF = 'https://example.com/a'

  const linkOnly = (): unknown => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'link', attrs: { href: LEGACY_HREF } }], text: 'here' },
        ],
      },
    ],
  })

  interface Nested {
    readonly content?: readonly Nested[]
    readonly marks?: readonly { readonly attrs?: Record<string, unknown> }[]
  }

  const markAttrs = (document_: unknown): Record<string, unknown> => {
    const editor = mount(document_)
    const json = editor.getJSON() as unknown as Nested
    editor.destroy()
    return json.content?.[0]?.content?.[0]?.marks?.[0]?.attrs ?? {}
  }

  it('gains four attributes a legacy file never carried, so the round-trip is not byte-identical', () => {
    const before = JSON.stringify(linkOnly())
    expect(JSON.stringify(mount(linkOnly()).getJSON())).not.toBe(before)
    expect(Object.keys(markAttrs(linkOnly())).sort()).toEqual([
      'class',
      'href',
      'rel',
      'target',
      'title',
    ])
  })

  it('takes rel and target from this app’s own Link options, not from Tiptap’s defaults', () => {
    expect(markAttrs(linkOnly())['rel']).toBe('noopener noreferrer nofollow')
    expect(markAttrs(linkOnly())['target']).toBe('_blank')
  })

  it('leaves the stored href exactly as it was, the gain being additive', () => {
    expect(markAttrs(linkOnly())['href']).toBe(LEGACY_HREF)
  })

  it('fills the two it has no value for with null rather than dropping them', () => {
    expect(markAttrs(linkOnly())['title']).toBeNull()
    expect(markAttrs(linkOnly())['class']).toBeNull()
  })
})

describe('trailingNode is off, so the first transaction is the users own', () => {
  const checklist = (): DocumentValue => {
    const tab = every().find((candidate) => endsInTaskList(candidate.document))
    if (tab === undefined) throw new Error('no stored tab ends in a taskList any more')
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

  it('styles a read-only surface so its checkboxes look untouchable, and an editable one not', () => {
    const readOnly = mount({ type: 'doc' }, false).view.dom.className
    const editable = mount({ type: 'doc' }, true).view.dom.className
    expect(readOnly).toContain('caret-transparent')
    expect(readOnly).toContain('[&_input[type=checkbox]]:pointer-events-none')
    expect(editable).not.toContain('caret-transparent')
    expect(editable).not.toContain('[&_input[type=checkbox]]:pointer-events-none')
    expect(editable).toContain('[&_input[type=checkbox]]:cursor-pointer')
    expect(readOnly).not.toContain('[&_input[type=checkbox]]:cursor-pointer')
  })

  it.each([true, false])(
    'styles the document as legacy did, editable %s: bullets and numbers under preflight, three heading sizes, gold quotes, code',
    (editable) => {
      const classes = mount({ type: 'doc' }, editable).view.dom.className.split(' ')
      expect(classes).toEqual(
        expect.arrayContaining([
          '[&_ul]:list-disc',
          '[&_ol]:list-decimal',
          '[&_ul]:pl-[1.4em]',
          '[&_h1]:text-[1.5em]',
          '[&_h2]:text-[1.25em]',
          '[&_h3]:text-[1.08em]',
          '[&_h1]:font-bold',
          '[&_blockquote]:border-gold',
          '[&_code]:bg-brand-soft',
          '[&_pre]:bg-[#211a3d]',
          '[&_pre]:text-[#f3f1fb]',
          '[&_pre_code]:bg-transparent',
          '[&_hr]:border-t',
        ]),
      )
    },
  )

  it('lays a checklist out as legacy did: rows, not bullets, with 17px brand checkboxes and checked items struck through', () => {
    const classes = mount({ type: 'doc' }, true).view.dom.className.split(' ')
    expect(classes).toEqual(
      expect.arrayContaining([
        '[&_ul[data-type=taskList]]:list-none',
        '[&_ul[data-type=taskList]]:pl-0',
        '[&_ul[data-type=taskList]>li]:flex',
        '[&_ul[data-type=taskList]>li]:gap-2.5',
        '[&_ul[data-type=taskList]>li>div]:flex-auto',
        '[&_ul[data-type=taskList]>li>div>p]:m-0',
        '[&_input[type=checkbox]]:size-[17px]',
        '[&_input[type=checkbox]]:accent-brand',
        '[&_li[data-checked=true]>div]:line-through',
        '[&_li[data-checked=true]>div]:text-muted-foreground',
      ]),
    )
  })

  it('draws the placeholder, which Tiptap only marks with data-placeholder and leaves to CSS to show', () => {
    const editor = mount({ type: 'doc', content: [{ type: 'paragraph' }] }, true)
    const empty = editor.view.dom.querySelector('p.is-editor-empty')
    expect(empty?.getAttribute('data-placeholder')).toBe(PLACEHOLDER)
    expect(editor.view.dom.className.split(' ')).toEqual(
      expect.arrayContaining(['[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]']),
    )
  })

  it('turns spellcheck off inside a code block, as legacy did', () => {
    const code = { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] }
    expect(mount(code).view.dom.querySelector('pre')?.getAttribute('spellcheck')).toBe('false')
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

const attrs = (href: string): Record<string, unknown> => ({
  href,
  target: '_blank',
  rel: 'noopener noreferrer nofollow',
  class: null,
  title: null,
})

describe('the link allowlist is one policy, whatever path a link arrives by', () => {
  const linked = (href: string): unknown => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'link', attrs: attrs(href) }], text: 'here' }],
      },
    ],
  })

  const anchor = (editor: Editor): HTMLAnchorElement | null => editor.view.dom.querySelector('a')

  it('renders a safe stored link as itself', () => {
    expect(anchor(mount(linked('https://example.com/a')))?.getAttribute('href')).toBe(
      'https://example.com/a',
    )
  })

  it('renders a stored link on a scheme Tiptap allows and the contracts do not as inert', () => {
    expect(anchor(mount(linked('ftp://example.com/file')))?.getAttribute('href')).toBe('')
    expect(anchor(mount(linked('sms:+441234')))?.getAttribute('href')).toBe('')
  })

  it('refuses setLink on such a scheme even when nothing went through the dialog', () => {
    const editor = mount(linked('https://example.com'))
    editor.commands.selectAll()
    expect(editor.commands.setLink({ href: 'ftp://example.com' })).toBe(false)
    expect(editor.commands.setLink({ href: 'https://example.org' })).toBe(true)
  })

  it('never rewrites the stored href, so the document round-trips even when it renders inert', () => {
    const stored = linked('ftp://example.com/file')
    expect(JSON.stringify(mount(stored).getJSON())).toBe(JSON.stringify(stored))
  })
})

describe('the one attribute Tiptap 3 adds to a stored mark', () => {
  const V2_LINK = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'https://example.com',
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  class: null,
                },
              },
            ],
            text: 'here',
          },
        ],
      },
    ],
  }

  it('adds title:null to a link mark Tiptap 2 wrote, and changes nothing else', () => {
    const mounted = mount(V2_LINK).getJSON()
    const expected = JSON.parse(JSON.stringify(V2_LINK)) as typeof V2_LINK
    const mark = expected.content[0]?.content[0]?.marks[0]
    if (mark === undefined) throw new Error('fixture lost its mark')
    Object.assign(mark.attrs, { title: null })
    expect(JSON.stringify(mounted)).toBe(JSON.stringify(expected))
  })
})
