import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import {
  GUARDED_SECURITY,
  PRINCIPAL_TOKEN_SCHEME,
  SERVICE_KEY_SCHEME,
  registerSecuritySchemes,
} from './security.js'

const CONFIG = { openapi: '3.1.0', info: { title: 'Test', version: '0.0.0' } } as const

const buildApp = (): OpenAPIHono => {
  const app = new OpenAPIHono()
  registerSecuritySchemes(app.openAPIRegistry)
  app.openapi(
    createRoute({
      method: 'get',
      path: '/guarded',
      security: GUARDED_SECURITY,
      responses: { 200: { description: 'ok', content: { 'application/json': { schema: z.object({ reached: z.boolean() }) } } } },
    }),
    (c) => c.json({ reached: true }, 200),
  )
  return app
}

const document = (): Record<string, unknown> =>
  buildApp().getOpenAPI31Document(CONFIG) as unknown as Record<string, unknown>

const schemes = (): Record<string, Record<string, unknown>> => {
  const components = document()['components'] as Record<string, unknown>
  return components['securitySchemes'] as Record<string, Record<string, unknown>>
}

describe('the security schemes', () => {
  it('declares the service key as an apiKey header, which is what names the calling app', () => {
    expect(schemes()[SERVICE_KEY_SCHEME]).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    })
  })

  it('declares the principal credential as one bearer scheme, because one token type covers both principal kinds', () => {
    expect(schemes()[PRINCIPAL_TOKEN_SCHEME]).toMatchObject({ type: 'http', scheme: 'bearer' })
  })

  it('declares exactly those two schemes and no third', () => {
    expect(Object.keys(schemes()).sort()).toEqual([PRINCIPAL_TOKEN_SCHEME, SERVICE_KEY_SCHEME].sort())
  })

  it('requires both credentials together rather than either one, so the document does not read as a choice', () => {
    expect(GUARDED_SECURITY).toHaveLength(1)
    expect(Object.keys(GUARDED_SECURITY[0] ?? {}).sort()).toEqual(
      [PRINCIPAL_TOKEN_SCHEME, SERVICE_KEY_SCHEME].sort(),
    )
  })

  it('puts the requirement on the operation it was declared on', () => {
    const paths = document()['paths'] as Record<string, Record<string, Record<string, unknown>>>
    expect(paths['/guarded']?.['get']?.['security']).toEqual([
      { [SERVICE_KEY_SCHEME]: [], [PRINCIPAL_TOKEN_SCHEME]: [] },
    ])
  })
})

describe('what a security declaration does not do', () => {
  it('answers 200 with no credentials at all, because the declaration is documentation and the middleware is the gate', async () => {
    const response = await buildApp().request('/guarded')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reached: true })
  })

  it('emits a scheme name nothing registered without complaining, which is why the names are constants', () => {
    const app = new OpenAPIHono()
    app.openapi(
      createRoute({
        method: 'get',
        path: '/typo',
        security: [{ serviceKy: [] }],
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({ reached: true }, 200),
    )
    const paths = app.getOpenAPI31Document(CONFIG).paths as Record<string, Record<string, Record<string, unknown>>>
    expect(paths['/typo']?.['get']?.['security']).toEqual([{ serviceKy: [] }])
  })
})
