import { describe, expect, it } from 'vitest'
import {
  EXPORT_ROUTE_PATH,
  TRANSFER_PAGE_PATH,
  UPLOAD_ROUTE_PATH,
  exportUrl,
  uploadUrl,
} from './paths'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

describe('the export address carries a disposition only when one was chosen', () => {
  it('is the bare route when nothing was chosen, so the API applies its own default', () => {
    expect(exportUrl(null)).toBe(EXPORT_ROUTE_PATH)
    expect(exportUrl(null)).not.toContain('?')
  })

  it('names preserve explicitly, since that is the half an admin has to ask for', () => {
    expect(exportUrl('preserve')).toBe(`${EXPORT_ROUTE_PATH}?tokens=preserve`)
  })

  it('encodes whatever it is given rather than trusting it to be one of the two', () => {
    expect(exportUrl('a b&c=d')).toBe(`${EXPORT_ROUTE_PATH}?tokens=a%20b%26c%3Dd`)
  })
})

describe('the upload address carries all three coordinates of one chunk', () => {
  it('names the session, the harvested path and the offset', () => {
    expect(uploadUrl({ sessionId: SESSION, path: 'drop/tasks/01T.json', offset: 1_000_000 })).toBe(
      `${UPLOAD_ROUTE_PATH}?sessionId=${SESSION}&path=drop%2Ftasks%2F01T.json&offset=1000000`,
    )
  })

  it('sends an offset of zero as a value, since the route defaults nothing (ADR 0044)', () => {
    expect(uploadUrl({ sessionId: SESSION, path: 'a', offset: 0 })).toContain('offset=0')
  })

  it('encodes the separators in a harvested path, which is why it is not a path segment', () => {
    const url = uploadUrl({ sessionId: SESSION, path: 'volume/01P/tasks/01T.json', offset: 0 })
    expect(url).toContain('path=volume%2F01P%2Ftasks%2F01T.json')
  })

  it('encodes a hostile path rather than letting it reach the URL as separators', () => {
    const url = uploadUrl({ sessionId: SESSION, path: '../../etc/passwd', offset: 0 })
    expect(url).toContain('path=..%2F..%2Fetc%2Fpasswd')
    expect(url).not.toContain('/../')
  })
})

describe('the page and the two handlers sit where ADR 0015 and the route tree put them', () => {
  it('puts the page on the admin surface and outside every /api tree', () => {
    expect(TRANSFER_PAGE_PATH).toBe('/transfer')
    expect(TRANSFER_PAGE_PATH.startsWith('/api')).toBe(false)
    expect(TRANSFER_PAGE_PATH.startsWith('/s/')).toBe(false)
  })

  it('puts both handlers under /api, which proxy.ts passes through ungated', () => {
    expect(EXPORT_ROUTE_PATH).toBe('/api/export')
    expect(UPLOAD_ROUTE_PATH).toBe('/api/import/upload')
  })
})
