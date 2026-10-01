import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseZoom, zoomTo } from './zoom'

const set = vi.fn()

const revalidatePath = vi.fn()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined, set }),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...args: readonly unknown[]) => revalidatePath(...args) }))

const asked = (rung: string): FormData => {
  const form = new FormData()
  form.set('rung', rung)
  return form
}

beforeEach(() => {
  set.mockClear()
  revalidatePath.mockClear()
})

describe('chooseZoom keeps the chosen rung for this browser', () => {
  it('writes each of the three rungs a control can submit', async () => {
    for (const rung of ['epic', 'feature', 'item']) {
      await chooseZoom(asked(rung))
      expect(set).toHaveBeenLastCalledWith('mp_zoom', rung, expect.objectContaining({ path: '/' }))
    }
  })

  it('revalidates the plan layout, which is what read the old value', async () => {
    await chooseZoom(asked('epic'))
    expect(revalidatePath).toHaveBeenCalledWith('/plans', 'layout')
  })

  // Validated on the way in as well as on the way out: the value arrives in a submitted body, so
  // writing it through unchecked would put an arbitrary string in a `Set-Cookie` header.
  it('writes nothing at all for a value no button of ours carries', async () => {
    for (const junk of ['', 'EPIC', 'quarter', 'feature; Domain=evil']) {
      await chooseZoom(asked(junk))
    }
    expect(set).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('writes nothing when the field is absent or is not a string', async () => {
    await chooseZoom(new FormData())
    const file = new FormData()
    file.set('rung', new File([''], 'epic'))
    await chooseZoom(file)
    expect(set).not.toHaveBeenCalled()
  })

  it('leaves the cookie readable to the client, since nothing about a zoom is a secret', async () => {
    await chooseZoom(asked('item'))
    expect(set).toHaveBeenCalledWith('mp_zoom', 'item', expect.objectContaining({ httpOnly: false }))
  })
})

describe('zoomTo, which a gesture calls with a rung rather than a form', () => {
  it('writes the same cookie chooseZoom writes, the form being the only difference between them', async () => {
    await zoomTo('epic')
    expect(set).toHaveBeenCalledWith('mp_zoom', 'epic', expect.objectContaining({ path: '/' }))
    expect(revalidatePath).toHaveBeenCalledWith('/plans', 'layout')
  })

  it('refuses a rung no stop of ours is named after, since a gesture is as forgeable as a form', async () => {
    for (const junk of ['', 'EPIC', 'quarter', 'item; Domain=evil']) await zoomTo(junk)
    expect(set).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
