import { describe, expect, it } from 'vitest'
import { openClick } from './open-click'
import { railPathOf } from '../board/rail-route'
import { planRootOf } from '../drawer/tab-stack'

const ROOT = '/plans/atlas'

const markup = (html: string): Element => {
  document.body.innerHTML = html
  const found = document.body.firstElementChild
  if (found === null) throw new Error('nothing was drawn')
  return found
}

const feature = (): Element =>
  markup(`<a data-slot="feature-link" href="${ROOT}/f/F1"><rect data-feature-id="F1"></rect></a>`)

const item = (): Element => markup('<rect data-item-id="I1"></rect>')

describe('the plan’s own path, read out of the address bar', () => {
  it('answers the page itself unchanged, on both surfaces', () => {
    expect(planRootOf(ROOT)).toBe(ROOT)
    expect(planRootOf('/s/TOKEN')).toBe('/s/TOKEN')
  })

  it('cuts a drawer off the end of it, whichever of the five it is', () => {
    expect(planRootOf(`${ROOT}/f/F1`)).toBe(ROOT)
    expect(planRootOf(`${ROOT}/i/I1`)).toBe(ROOT)
    expect(planRootOf(`${ROOT}/r/EP1`)).toBe(ROOT)
    expect(planRootOf(`${ROOT}/g/LB1`)).toBe(ROOT)
    expect(planRootOf(`${ROOT}/new/rail`)).toBe(ROOT)
    expect(planRootOf('/s/TOKEN/i/I1')).toBe('/s/TOKEN')
  })

  // A plan whose id happens to read like a segment is still a plan page: the cut is the second-to-last
  // segment, so only an address with a drawer on it loses one.
  it('leaves a path whose last segment is not a drawer alone', () => {
    expect(planRootOf('/plans/f')).toBe('/plans/f')
  })
})

describe('where a click on a mark goes', () => {
  it('follows a feature’s own link, with the stack written into it', () => {
    const target = feature().firstElementChild

    expect(openClick(target, 'i:I9', ROOT)).toBe(`${ROOT}/f/F1?open=i:I9,f:F1`)
  })

  // An item is not an anchor — two thousand of them would be two thousand elements — so its route is
  // built from its id and the address the reader is already on.
  it('builds an item’s route from its id and the page it was clicked on', () => {
    expect(openClick(item(), null, `${ROOT}/f/F1`)).toBe(`${ROOT}/i/I1?open=i:I1`)
  })

  it('keeps the tabs already open when an item is clicked', () => {
    expect(openClick(item(), 'f:F1', `${ROOT}/f/F1`)).toBe(`${ROOT}/i/I1?open=f:F1,i:I1`)
  })

  it('answers nothing for a click on the board itself, which opens nothing', () => {
    expect(openClick(markup('<rect data-slot="rail-band"></rect>'), null, ROOT)).toBeNull()
    expect(openClick(null, null, ROOT)).toBeNull()
  })
})

// A dropped rail arrives called `New epic`, so the drop opens the one place it can be renamed.
describe('where a dropped rail opens', () => {
  it('is its own drawer, under the plan the browser is on', () => {
    expect(railPathOf(ROOT, 'EP1')).toBe(`${ROOT}/r/EP1`)
    expect(railPathOf(`${ROOT}/f/F1`, 'EP1')).toBe(`${ROOT}/r/EP1`)
    expect(railPathOf('/s/TOKEN/i/I1', 'EP1')).toBe('/s/TOKEN/r/EP1')
  })

  it('encodes the id there too', () => {
    expect(railPathOf(ROOT, '../elsewhere')).toBe(`${ROOT}/r/..%2Felsewhere`)
  })
})
