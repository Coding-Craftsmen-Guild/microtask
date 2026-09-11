import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { buildExtensions } from './extensions'
import { TOOLBAR, type ToolbarEntry } from './toolbar-items'
import { Toolbar } from './toolbar'

const HELLO = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
}

let editor: Editor | null = null

function Host({ onLink }: { onLink: () => void }) {
  editor = useEditor({
    immediatelyRender: false,
    extensions: buildExtensions(true),
    content: HELLO,
    autofocus: false,
  })
  return (
    <div>
      <Toolbar editor={editor} onLink={onLink} />
      <EditorContent editor={editor} />
    </div>
  )
}

const host = async (onLink = (): void => undefined) => {
  const view = await act(async () => render(<Host onLink={onLink} />))
  return view
}

const live = (): Editor => {
  if (editor === null) throw new Error('the editor never mounted')
  return editor
}

const button = (title: string): HTMLElement => screen.getByTitle(title)

afterEach(() => {
  cleanup()
  editor = null
})

const items = TOOLBAR.filter((entry): entry is Exclude<ToolbarEntry, 'separator'> => entry !== 'separator')

describe('the toolbar legacy had, button for button', () => {
  it('keeps the labels in order, separators included', async () => {
    await host()
    expect(TOOLBAR.map((entry) => (entry === 'separator' ? '|' : entry.label))).toEqual([
      'B', 'I', 'S', '</>', '|', 'H1', 'H2', 'H3', '|', '☑', '•', '1.', '❝', '―', '|', '🔗',
    ])
  })

  it('titles every button the way legacy did, shortcuts included', async () => {
    await host()
    expect(items.map((item) => item.title)).toEqual([
      'Bold (Ctrl+B)',
      'Italic (Ctrl+I)',
      'Strikethrough',
      'Inline code',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Checklist',
      'Bullet list',
      'Numbered list',
      'Quote',
      'Divider',
      'Link',
    ])
  })

  it('renders one button per item and three separators', async () => {
    await host()
    for (const item of items) expect(button(item.title)).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBe(items.length)
    expect(screen.getAllByRole('separator').length).toBe(3)
  })
})

describe('a click runs the command on a focused chain', () => {
  it('turns the selection bold', async () => {
    await host()
    act(() => {
      live().commands.selectAll()
    })
    act(() => {
      button('Bold (Ctrl+B)').click()
    })
    expect(live().isActive('bold')).toBe(true)
  })

  it('wraps the block in a checklist, which is the products whole metric', async () => {
    await host()
    act(() => {
      button('Checklist').click()
    })
    expect(live().isActive('taskList')).toBe(true)
  })

  it('inserts a divider even though the button has no state to light up', async () => {
    await host()
    act(() => {
      button('Divider').click()
    })
    expect(JSON.stringify(live().getJSON())).toContain('horizontalRule')
    expect(button('Divider').getAttribute('aria-pressed')).toBe('false')
  })

  it('hands focus back to the document, so typing carries on after a click', async () => {
    await host()
    expect(live().view.hasFocus()).toBe(false)
    await act(async () => {
      button('Bold (Ctrl+B)').click()
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(live().view.hasFocus()).toBe(true)
  })

  it('preventDefaults mousedown, so clicking a button never drops the selection', async () => {
    await host()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      button('Bold (Ctrl+B)').dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('hands the link button to the caller rather than running a command', async () => {
    const onLink = vi.fn()
    await host(onLink)
    act(() => {
      button('Link').click()
    })
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(live().getJSON())).not.toContain('link')
  })
})

describe('the active state, which is what shouldRerenderOnTransaction would silently break', () => {
  it('lights the bold button up when the caret is inside bold text', async () => {
    await host()
    expect(button('Bold (Ctrl+B)').getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      live().chain().selectAll().toggleBold().run()
    })
    expect(button('Bold (Ctrl+B)').getAttribute('aria-pressed')).toBe('true')
  })

  it('lights up a node button, and only the one that matches the level', async () => {
    await host()
    await act(async () => {
      live().chain().focus().toggleHeading({ level: 2 }).run()
    })
    expect(button('Heading 2').getAttribute('aria-pressed')).toBe('true')
    expect(button('Heading 1').getAttribute('aria-pressed')).toBe('false')
    expect(button('Heading 3').getAttribute('aria-pressed')).toBe('false')
  })

  it('goes dark again when the mark is toggled back off', async () => {
    await host()
    await act(async () => {
      live().chain().selectAll().toggleBold().run()
    })
    await act(async () => {
      live().chain().selectAll().toggleBold().run()
    })
    expect(button('Bold (Ctrl+B)').getAttribute('aria-pressed')).toBe('false')
  })

  it('carries the active state on the class as well, so it is visible and not only announced', async () => {
    await host()
    const before = button('Bold (Ctrl+B)').className
    await act(async () => {
      live().chain().selectAll().toggleBold().run()
    })
    expect(button('Bold (Ctrl+B)').className).not.toBe(before)
  })
})

describe('before the editor exists', () => {
  it('renders every button inert rather than crashing on a null editor', () => {
    render(<Toolbar editor={null} onLink={() => undefined} />)
    expect(screen.getAllByRole('button').length).toBe(items.length)
    act(() => {
      screen.getByTitle('Bold (Ctrl+B)').click()
    })
    expect(screen.getByTitle('Bold (Ctrl+B)').getAttribute('aria-pressed')).toBe('false')
  })
})
