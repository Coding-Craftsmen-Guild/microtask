import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { DOCS_PATH, DOC_PATH, docConfig, docsHandler } from './docs.js'

const buildApp = (): OpenAPIHono => {
  const app = new OpenAPIHono()
  app.doc31(DOC_PATH, docConfig)
  app.get(DOCS_PATH, docsHandler)
  return app
}

const page = async (): Promise<Response> => buildApp().request(DOCS_PATH)

describe('the docs page', () => {
  it('is served as HTML', async () => {
    const response = await page()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it('names no external origin anywhere in its markup, which is the whole of the offline decision', async () => {
    const html = await (await page()).text()
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/src=["']\/\//)
    expect(html).not.toMatch(/href=["']\/\//)
  })

  it('reads the document from this API over a same-origin path', async () => {
    expect(await (await page()).text()).toContain(DOC_PATH)
  })

  it('forbids every origin in a content security policy rather than merely omitting them', async () => {
    const policy = (await page()).headers.get('content-security-policy') ?? ''
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).toContain("base-uri 'none'")
  })

  it('admits its own inline script by hash, so not even an injected inline script runs', async () => {
    const policy = (await page()).headers.get('content-security-policy') ?? ''
    expect(policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/)
    expect(policy).not.toContain("script-src 'unsafe-inline'")
  })

  it('refuses to be framed and refuses to be sniffed', async () => {
    const response = await page()
    expect(response.headers.get('content-security-policy') ?? '').toContain("frame-ancestors 'none'")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('is never cached, so a redeployed document is never read from a stale page', async () => {
    expect((await page()).headers.get('cache-control')).toBe('no-store')
  })
})

describe('the document configuration', () => {
  it('declares OpenAPI 3.1', () => {
    expect(docConfig.openapi).toBe('3.1.0')
  })

  it('names the API and a version', () => {
    expect(docConfig.info.title.length).toBeGreaterThan(0)
    expect(docConfig.info.version.length).toBeGreaterThan(0)
  })

  it('serves the document at the path the page reads', async () => {
    const response = await buildApp().request(DOC_PATH)
    expect(response.status).toBe(200)
    expect(((await response.json()) as { openapi: string }).openapi).toBe('3.1.0')
  })
})

describe('why the document is emitted by a build script and never scraped from this route', () => {
  it('answers 500 with a body that parses as JSON when generation throws, so a scraper exits 0 and overwrites a good spec', async () => {
    const app = new OpenAPIHono()
    app.doc31(DOC_PATH, docConfig)
    app.openapi(
      createRoute({
        method: 'get',
        path: '/unrepresentable',
        request: { query: z.object({ seen: z.set(z.string()) }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({ ok: true }, 200),
    )
    const response = await app.request(DOC_PATH)
    const text = await response.text()
    expect(response.status).toBe(500)
    expect(() => JSON.parse(text) as unknown).not.toThrow()
  })
})
