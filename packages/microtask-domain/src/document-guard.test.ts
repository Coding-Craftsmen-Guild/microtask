import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { assertSafeDocument, MAX_DOCUMENT_BYTES, SAFE_HREF_SCHEMES } from './document-guard.js'

const doc = (...content: unknown[]) => ({ type: 'doc', content })

const linkMark = (href: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
})

describe('assertSafeDocument', () => {
  it('accepts the document a new tab starts with', () => {
    expect(() => assertSafeDocument(doc({ type: 'paragraph' }))).not.toThrow()
  })

  it.each([
    ['a non-object', 42],
    ['null', null],
    ['a node that is not a doc', { type: 'paragraph' }],
    ['a content property that is not an array', { type: 'doc', content: 'nope' }],
  ])('rejects %s', (_label, value) => {
    expect(() => assertSafeDocument(value)).toThrow(Invalid)
  })

  it('rejects a document over the size cap', () => {
    const big = doc({ type: 'text', text: 'x'.repeat(MAX_DOCUMENT_BYTES) })
    expect(() => assertSafeDocument(big)).toThrow(Invalid)
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects %s as a key', (key) => {
    const parsed = JSON.parse(`{"type":"doc","content":[{"type":"p","${key}":{"bad":1}}]}`)
    expect(() => assertSafeDocument(parsed)).toThrow(Invalid)
  })

  it.each([...SAFE_HREF_SCHEMES])('accepts a %s link', (scheme) => {
    expect(() => assertSafeDocument(doc(linkMark(`${scheme}:example`)))).not.toThrow()
  })

  it('accepts the four attributes Tiptap 3 adds to an imported link, so the first save is not refused', () => {
    const expanded = {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'x',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://example.com/a',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
                title: null,
              },
            },
          ],
        },
      ],
    }
    expect(() => assertSafeDocument(doc(expanded))).not.toThrow()
  })

  it('still refuses a hostile href once those four are present, the gain being no way past', () => {
    const expanded = JSON.parse(
      JSON.stringify({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'x',
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'javascript:alert(1)',
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  class: null,
                  title: null,
                },
              },
            ],
          },
        ],
      }),
    ) as unknown
    expect(() => assertSafeDocument(doc(expanded))).toThrow(/scheme/i)
  })

  it.each(['javascript:alert(1)', 'data:text/html;base64,x', 'vbscript:x', 'file:///etc/passwd'])(
    'rejects a %s link',
    (href) => {
      expect(() => assertSafeDocument(doc(linkMark(href)))).toThrow(Invalid)
    },
  )

  it('accepts a relative href, which carries no scheme', () => {
    expect(() => assertSafeDocument(doc(linkMark('/somewhere')))).not.toThrow()
  })

  it('rejects a document nested past the depth cap', () => {
    let node: unknown = { type: 'paragraph' }
    for (let i = 0; i < 200; i += 1) node = { type: 'bulletList', content: [node] }
    expect(() => assertSafeDocument(doc(node))).toThrow(Invalid)
  })

  it('names the reason it rejected, so the import preview can show it', () => {
    expect(() => assertSafeDocument(doc(linkMark('javascript:x')))).toThrow(/scheme/i)
  })

  it.each([
    ['a leading space', ' javascript:alert(1)'],
    ['a leading tab', '\tjavascript:alert(1)'],
    ['a leading newline', '\njavascript:alert(1)'],
    ['a leading NUL', '\u0000javascript:alert(1)'],
    ['a tab inside the scheme', 'java\tscript:alert(1)'],
    ['a newline inside the scheme', 'java\nscript:alert(1)'],
    ['a carriage return inside the scheme', 'java\rscript:alert(1)'],
  ])('rejects a javascript URL smuggled past the scheme check by %s', (_label, href) => {
    expect(() => assertSafeDocument(doc(linkMark(href)))).toThrow(Invalid)
  })

  it('checks src as well as href, so a media node cannot carry a script URL', () => {
    const image = { type: 'image', attrs: { src: 'javascript:alert(1)' } }
    expect(() => assertSafeDocument(doc(image))).toThrow(Invalid)
  })

  it('finds a banned key below attrs, where a content-only walk never reaches', () => {
    const parsed = JSON.parse(
      '{"type":"doc","content":[{"type":"p","attrs":{"style":{"__proto__":{}}}}]}',
    )
    expect(() => assertSafeDocument(parsed)).toThrow(Invalid)
  })

  it('measures the size cap in UTF-8 bytes, not UTF-16 code units', () => {
    const big = doc({ type: 'text', text: '\u{1F600}'.repeat(600_000) })
    expect(JSON.stringify(big).length).toBeLessThan(MAX_DOCUMENT_BYTES)
    expect(() => assertSafeDocument(big)).toThrow(Invalid)
  })
})
