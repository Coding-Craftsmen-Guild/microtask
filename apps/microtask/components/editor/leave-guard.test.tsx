import { afterEach, describe, expect, it } from 'vitest'
import { leavesPage } from './leave-guard'

const HERE = 'http://localhost:3000/p/P1/t/T1?tab=a'

const anchor = (attributes: Readonly<Record<string, string>>): HTMLAnchorElement => {
  const element = document.createElement('a')
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.append(document.createElement('span'))
  document.body.append(element)
  return element
}

const judged = (target: Element, init: MouseEventInit = {}, prevented = false): boolean => {
  let answer: boolean | null = null
  const listen = (event: Event): void => {
    if (prevented) event.preventDefault()
    answer = leavesPage(event as MouseEvent, HERE)
    event.preventDefault()
  }
  window.addEventListener('click', listen, true)
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))
  window.removeEventListener('click', listen, true)
  if (answer === null) throw new Error('the click never reached the window')
  return answer
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('leavesPage: which clicks would take the page somewhere else', () => {
  it('counts a plain click on a same-origin link to another page', () => {
    expect(judged(anchor({ href: '/p/P1' }))).toBe(true)
  })

  it('counts a click on something inside the link, which is where the pointer usually is', () => {
    const link = anchor({ href: '/' })
    expect(judged(link.firstElementChild as Element)).toBe(true)
  })

  it('counts an absolute href on this origin', () => {
    expect(judged(anchor({ href: 'http://localhost:3000/' }))).toBe(true)
  })

  it('counts an explicit _self target', () => {
    expect(judged(anchor({ href: '/p/P1', target: '_self' }))).toBe(true)
  })

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['cmd', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['the middle button', { button: 1 }],
  ] as const)('leaves a click with %s alone, which opens elsewhere and keeps this page', (_name, init) => {
    expect(judged(anchor({ href: '/p/P1' }), init)).toBe(false)
  })

  it('leaves a link that opens in another tab alone, or in a window it names', () => {
    expect(judged(anchor({ href: '/p/P1', target: '_blank' }))).toBe(false)
    expect(judged(anchor({ href: '/p/P1', target: 'help' }))).toBe(false)
  })

  it('counts _top and _parent in any case, which take this page away as _self does', () => {
    expect(judged(anchor({ href: '/p/P1', target: '_top' }))).toBe(true)
    expect(judged(anchor({ href: '/p/P1', target: '_PARENT' }))).toBe(true)
  })

  it('leaves a download link alone', () => {
    expect(judged(anchor({ href: '/p/P1', download: '' }))).toBe(false)
  })

  it('leaves another origin to beforeunload, which the browser fires for it, so nothing asks twice', () => {
    expect(judged(anchor({ href: 'https://example.com/' }))).toBe(false)
  })

  it('leaves a link to this same page alone, whatever its query or fragment, since nothing remounts', () => {
    expect(judged(anchor({ href: '/p/P1/t/T1?tab=b' }))).toBe(false)
    expect(judged(anchor({ href: '#top' }))).toBe(false)
  })

  it('leaves a click something else already cancelled alone, since it will not navigate', () => {
    expect(judged(anchor({ href: '/p/P1' }), {}, true)).toBe(false)
  })

  it('leaves a click on something that is not a link, or on a link with no href, alone', () => {
    const button = document.createElement('button')
    document.body.append(button)
    expect(judged(button)).toBe(false)
    expect(judged(anchor({}))).toBe(false)
  })
})
