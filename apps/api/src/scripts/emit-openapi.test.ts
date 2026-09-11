import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { docConfig } from '../http/docs.js'
import { GUARDED_PREFIX } from '../testing/harness.js'
import { OPENAPI_FILE, documentText, emitDocument, freshDocumentText } from './openapi-document.js'

const committed = async (): Promise<unknown> => JSON.parse(await readFile(OPENAPI_FILE, 'utf8'))

const fresh = async (): Promise<unknown> => JSON.parse(await freshDocumentText())

const cannotBeDescribed = (): OpenAPIHono => {
  const app = new OpenAPIHono()
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/never',
    responses: {
      200: { description: 'A kind that throws', content: { 'application/json': { schema: z.never() } } },
    },
  })
  return app
}

const inTempDirectory = async (run: (target: URL) => Promise<void>): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), 'openapi-guard-'))
  try {
    await run(pathToFileURL(join(directory, 'openapi.json')))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('guard (1): the committed document equals a fresh generation', () => {
  it('matches openapi.json on disk exactly', async () => {
    expect(await committed()).toEqual(await fresh())
  })

  it('compares a document describing the guarded tree, so the equality is not two stubs', async () => {
    const paths = Object.keys(((await committed()) as { paths: object }).paths)
    expect(paths.filter((path) => path.startsWith(GUARDED_PREFIX)).length).toBeGreaterThan(10)
  })

  it('is generated from the same config the doc route serves', async () => {
    const served = (await fresh()) as { info: { title: string }; openapi: string }
    expect(served.info.title).toBe(docConfig.info.title)
    expect(served.openapi).toBe('3.1.0')
  })
})

describe('guard (1b): generation is where it fails, and a failure writes nothing', () => {
  it('throws rather than describing a schema kind the generator cannot express', () => {
    expect(() => documentText(cannotBeDescribed())).toThrow()
  })

  it('describes an app it can express, so the throw is the schema kind and not the plumbing', () => {
    const app = new OpenAPIHono()
    app.openAPIRegistry.registerPath({ method: 'get', path: '/fine', responses: { 204: { description: 'ok' } } })
    expect(JSON.parse(documentText(app))).toMatchObject({ openapi: '3.1.0' })
  })

  it('leaves no file behind when generation throws, which scraping the live route would not', async () => {
    await inTempDirectory(async (target) => {
      const failing = (): Promise<string> => Promise.reject(new Error('generation failed'))
      await expect(emitDocument(target, failing)).rejects.toThrow('generation failed')
      await expect(readFile(target, 'utf8')).rejects.toThrow()
    })
  })

  it('writes the document when generation succeeds, so the previous case is not vacuous', async () => {
    await inTempDirectory(async (target) => {
      await emitDocument(target, freshDocumentText)
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(await fresh())
    })
  })
})
