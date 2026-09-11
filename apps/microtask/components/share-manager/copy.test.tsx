import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyLink } from './copy'

const URL_TEXT = 'https://tasks.example.com/s/tok_ABCDEFGHIJKLMNOP'

const field = () => {
  const input = document.createElement('input')
  input.value = URL_TEXT
  document.body.append(input)
  return input
}

const clipboard = (writeText: () => Promise<void>) =>
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard)

const execCommand = (answer: () => boolean) => {
  const spy = vi.fn(answer)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: spy })
  return spy
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('copyLink', () => {
  it('selects the URL first, so it is visibly highlighted and Ctrl+C would work too', async () => {
    const input = field()
    clipboard(() => Promise.resolve())
    await copyLink(input, URL_TEXT)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, URL_TEXT.length])
  })

  it('answers true when the clipboard took it, without falling back', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    clipboard(writeText)
    const fallback = execCommand(() => true)
    expect(await copyLink(field(), URL_TEXT)).toBe(true)
    expect(writeText).toHaveBeenCalledWith(URL_TEXT)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when the clipboard refuses, and says whether that worked', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    const fallback = execCommand(() => true)
    expect(await copyLink(field(), URL_TEXT)).toBe(true)
    expect(fallback).toHaveBeenCalledWith('copy')
  })

  it('answers false when both fail, rather than claiming a copy that never happened', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    execCommand(() => false)
    expect(await copyLink(field(), URL_TEXT)).toBe(false)
  })

  it('answers false when the fallback throws', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    execCommand(() => {
      throw new Error('unsupported')
    })
    expect(await copyLink(field(), URL_TEXT)).toBe(false)
  })

  it('falls back when there is no clipboard at all, as on an insecure origin', async () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
    execCommand(() => true)
    expect(await copyLink(field(), URL_TEXT)).toBe(true)
  })
})
