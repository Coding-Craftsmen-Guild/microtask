/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DocumentEditor } from './document-editor'

const HEADING = {
  type: 'doc' as const,
  content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Go-live' }] }],
}

const serve = (editable: boolean): string =>
  renderToString(
    <DocumentEditor
      document={HEADING}
      editable={editable}
      onReload={() => undefined}
      save={() => Promise.resolve({ kind: 'saved', updatedAt: 'v2' })}
      updatedAt="v1"
    />,
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the App Router server pass, in a real server environment', () => {
  it('runs with no window, which is what makes this the server and not a simulation', () => {
    expect(typeof window).toBe('undefined')
  })

  it('renders the island without an editor and without throwing', () => {
    const html = serve(true)
    expect(html).not.toContain('ProseMirror')
    expect(html).toContain('role="toolbar"')
  })

  it('draws every toolbar button unpressed, the server never holding an editor to ask', () => {
    expect(serve(true)).not.toContain('aria-pressed="true"')
  })

  it('never has Tiptap overrule immediatelyRender, which it does, with a warning, when it is true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    serve(true)
    serve(false)
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([])
  })

  it('renders a read-only view with no toolbar at all', () => {
    expect(serve(false)).not.toContain('role="toolbar"')
  })
})
