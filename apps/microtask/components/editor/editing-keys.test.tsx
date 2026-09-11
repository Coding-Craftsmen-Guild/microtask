import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions, editorProps } from './extensions'

const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
})

const mount = (): Editor => {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions(true),
    editorProps: editorProps(true),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    autofocus: false,
  })
  editors.push(editor)
  return editor
}

const type = (editor: Editor, text: string): void => {
  for (const character of text) {
    const { view } = editor
    const { from, to } = view.state.selection
    const insert = () => view.state.tr.insertText(character, from, to)
    const handled = view.someProp('handleTextInput', (handler) => handler(view, from, to, character, insert))
    if (handled !== true) view.dispatch(insert())
  }
}

const press = (editor: Editor, key: string, init: KeyboardEventInit = {}): boolean => {
  const { view } = editor
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true, ...init })
  return view.someProp('handleKeyDown', (handler) => handler(view, event)) === true
}

interface Json {
  readonly type?: string
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly Json[]
  readonly text?: string
}

const json = (editor: Editor): Json => editor.getJSON() as Json

const first = (editor: Editor): Json | undefined => json(editor).content?.[0]

describe('the markdown shorthands legacy inherited from Tiptap, which no toolbar test reaches', () => {
  it.each([
    ['[ ] ', 'taskList', false],
    ['[] ', 'taskList', false],
    ['[x] ', 'taskList', true],
  ])('turns %j at the start of a line into a checklist item, checked %s', (shorthand, node, checked) => {
    const editor = mount()
    type(editor, shorthand)
    expect(first(editor)?.type).toBe(node)
    expect(first(editor)?.content?.[0]?.attrs?.['checked']).toBe(checked)
  })

  it.each([
    ['# ', 1],
    ['## ', 2],
    ['### ', 3],
  ])('turns %j into a heading of level %i', (shorthand, level) => {
    const editor = mount()
    type(editor, shorthand)
    expect(first(editor)).toMatchObject({ type: 'heading', attrs: { level } })
  })

  it('leaves #### as text, there being no fourth heading level', () => {
    const editor = mount()
    type(editor, '#### ')
    expect(first(editor)?.type).toBe('paragraph')
  })

  it.each([
    ['- ', 'bulletList'],
    ['* ', 'bulletList'],
    ['1. ', 'orderedList'],
    ['> ', 'blockquote'],
    ['``` ', 'codeBlock'],
  ])('turns %j into a %s', (shorthand, node) => {
    const editor = mount()
    type(editor, shorthand)
    expect(first(editor)?.type).toBe(node)
  })

  it('turns --- into a divider', () => {
    const editor = mount()
    type(editor, '---')
    expect(json(editor).content?.some((node) => node.type === 'horizontalRule')).toBe(true)
  })

  it('turns **text** into bold text', () => {
    const editor = mount()
    type(editor, '**done**')
    expect(first(editor)?.content?.[0]).toMatchObject({ text: 'done', marks: [{ type: 'bold' }] })
  })
})

describe('the keyboard shortcuts legacy inherited from Tiptap', () => {
  it('wraps the line in a checklist on Mod-Shift-9', () => {
    const editor = mount()
    type(editor, 'Ship it')
    press(editor, '(', { shiftKey: true, keyCode: 57 })
    expect(first(editor)?.type).toBe('taskList')
  })

  it('bolds on Mod-B', () => {
    const editor = mount()
    type(editor, 'x')
    editor.commands.selectAll()
    press(editor, 'b')
    expect(editor.isActive('bold')).toBe(true)
  })

  it('sinks a checklist item under the one above on Tab, and lifts it back on Shift-Tab', () => {
    const editor = mount()
    type(editor, '[ ] one')
    press(editor, 'Enter', { ctrlKey: false })
    type(editor, 'two')
    press(editor, 'Tab', { ctrlKey: false })
    const nested = () => first(editor)?.content?.[0]?.content?.[1]?.type
    expect(nested()).toBe('taskList')
    press(editor, 'Tab', { ctrlKey: false, shiftKey: true })
    expect(nested()).toBeUndefined()
    expect(first(editor)?.content?.length).toBe(2)
  })

  it('undoes on Mod-Z', () => {
    const editor = mount()
    type(editor, 'x')
    press(editor, 'z')
    expect(editor.getText()).toBe('')
  })

  it('binds nothing to Mod-K, the link dialog being reachable only from its button, as in legacy', () => {
    const editor = mount()
    type(editor, 'x')
    expect(press(editor, 'k')).toBe(false)
  })
})

describe('the drag and drop legacy had, which is ProseMirror’s own', () => {
  it('keeps the drop cursor and the gap cursor StarterKit bundles', () => {
    const editor = mount()
    const names = editor.extensionManager.extensions.map((extension) => extension.name)
    expect(names).toEqual(expect.arrayContaining(['dropCursor', 'gapCursor']))
  })
})
