import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { buildExtensions } from './extensions'
import { LINK_REFUSED, LinkDialog } from './link-dialog'

const TAB = '\u0009'
const NUL = '\u0000'

const PLAIN = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }],
}

const LINKED = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'see ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/old' } }],
          text: 'the site',
        },
      ],
    },
  ],
}

let editor: Editor | null = null

interface HostProps {
  readonly content: object
  readonly onClose: () => void
  readonly shown: boolean
}

function Host({ content, onClose, shown }: HostProps) {
  const [open, setOpen] = useState(shown)
  editor = useEditor({ immediatelyRender: false, extensions: buildExtensions(true), content })
  const close = (): void => {
    onClose()
    setOpen(false)
  }
  return (
    <div>
      <EditorContent editor={editor} />
      <button onClick={() => setOpen(true)} type="button">
        open the dialog
      </button>
      <LinkDialog editor={editor} onClose={close} open={open} />
    </div>
  )
}

const live = (): Editor => {
  if (editor === null) throw new Error('the editor never mounted')
  return editor
}

const open = async (content: object = PLAIN, shown = true) => {
  const onClose = vi.fn()
  await act(async () => {
    render(<Host content={content} onClose={onClose} shown={shown} />)
  })
  return onClose
}

const field = (): HTMLInputElement => screen.getByRole('textbox')

const hrefs = (): string[] =>
  JSON.stringify(live().getJSON()).match(/"href":"[^"]*"/g)?.map((match) => match.slice(8, -1)) ?? []

const apply = async (value: string): Promise<void> => {
  field().value = value
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
}

const selectAll = (): void => {
  act(() => {
    live().commands.selectAll()
  })
}

afterEach(() => {
  cleanup()
  editor = null
})

describe('the dialog legacy opened', () => {
  it('says Add link, with the hint and placeholder legacy used, when there is none yet', async () => {
    await open()
    expect(screen.getByText('Add link')).toBeTruthy()
    expect(screen.getByText('Leave empty to remove the link.')).toBeTruthy()
    expect(field().placeholder).toBe('https://example.com')
    expect(field().value).toBe('')
  })
})

describe('applying a link', () => {
  it('links the selection to what was typed', async () => {
    await open()
    selectAll()
    await apply('https://example.com/new')
    expect(hrefs()).toEqual(['https://example.com/new'])
  })

  it('prepends https to a bare host, which is what legacy did', async () => {
    await open()
    selectAll()
    await apply('example.com')
    expect(hrefs()).toEqual(['https://example.com'])
  })

  it('closes once the link is applied', async () => {
    const onClose = await open()
    selectAll()
    await apply('example.com')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('editing and removing an existing link', () => {
  const caretInsideLink = (): void => {
    act(() => {
      live().commands.setTextSelection(8)
    })
  }

  it('retargets the whole link from a bare caret inside it, extendMarkRange being the point', async () => {
    await open(LINKED)
    caretInsideLink()
    await apply('https://example.com/new')
    expect(hrefs()).toEqual(['https://example.com/new'])
    expect(live().getText()).toBe('see the site')
  })

  it('says Edit link, seeded with the href, when the caret is already inside one', async () => {
    await open(LINKED, false)
    caretInsideLink()
    await userEvent.click(screen.getByRole('button', { name: 'open the dialog' }))
    expect(screen.getByText('Edit link')).toBeTruthy()
    expect(field().value).toBe('https://example.com/old')
  })

  it('removes the whole link when the field is emptied, rather than refusing the empty string', async () => {
    const onClose = await open(LINKED)
    caretInsideLink()
    await apply('')
    expect(hrefs()).toEqual([])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('a hostile href is refused before anything is sent', () => {
  const HOSTILE = [
    'javascript:alert(1)',
    `${NUL}javascript:alert(1)`,
    `java${TAB}script:alert(1)`,
    `java${NUL}script:alert(1)`,
    'JavaScript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
  ]

  it('lists only disguises the field hands the guard intact, since one it trims or strips tests nothing', async () => {
    await open()
    for (const hostile of HOSTILE) {
      field().value = hostile
      expect(field().value.trim()).toBe(hostile)
    }
  })

  it.each(HOSTILE)('refuses %j, leaves the document alone and says why', async (hostile) => {
    const onClose = await open()
    selectAll()
    const before = JSON.stringify(live().getJSON())
    const thrown: unknown[] = []
    const record = (event: ErrorEvent): void => {
      thrown.push(event.error)
    }
    window.addEventListener('error', record)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await apply(hostile)
    window.removeEventListener('error', record)
    expect(thrown).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
    expect(JSON.stringify(live().getJSON())).toBe(before)
    expect(screen.getByText(LINK_REFUSED)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('forgets the refusal once the dialog closes, so the next opening starts clean', async () => {
    await open(PLAIN, false)
    await userEvent.click(screen.getByRole('button', { name: 'open the dialog' }))
    await apply('javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'open the dialog' }))
    expect(screen.getByText('Leave empty to remove the link.')).toBeTruthy()
    expect(screen.queryByText(LINK_REFUSED)).toBe(null)
  })

  it('names exactly the schemes the contracts allow in the refusal', () => {
    expect(LINK_REFUSED).toContain('http, https, mailto or tel')
  })

  it('applies a good link typed straight after a refusal', async () => {
    const onClose = await open()
    selectAll()
    await apply('javascript:alert(1)')
    await apply('https://example.com')
    expect(hrefs()).toEqual(['https://example.com'])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('cancelling', () => {
  it('changes nothing and closes', async () => {
    const onClose = await open(LINKED)
    const before = JSON.stringify(live().getJSON())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(JSON.stringify(live().getJSON())).toBe(before)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('before the editor exists', () => {
  it('closes without touching anything rather than crashing on a null editor', async () => {
    const onClose = vi.fn()
    render(<LinkDialog editor={null} onClose={onClose} open />)
    field().value = 'example.com'
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
