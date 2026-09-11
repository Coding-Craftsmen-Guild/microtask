import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { docConfig } from '../http/docs.js'
import { folderParams, projectParams, shareLinkParams, tabParams, taskParams } from './params.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T1 = '01M240ERCRWWCN16Q5AHP1FZB1'

const emitted = <T extends z.ZodObject>(path: string, params: T): { name: string; in: string }[] => {
  const child = new OpenAPIHono()
  child.openapi(
    createRoute({ method: 'get', path, request: { params }, responses: { 200: { description: 'ok' } } }),
    (c) => c.json({ ok: true }, 200),
  )
  const parent = new OpenAPIHono()
  parent.route('/projects/:projectId', child)
  const document = parent.getOpenAPI31Document(docConfig)
  const paths = document.paths as Record<string, Record<string, { parameters?: { name: string; in: string }[] }>>
  const merged = `/projects/{projectId}${path === '/' ? '' : path}`
  return paths[merged]?.['get']?.parameters ?? []
}

describe('a path parameter the parent owns', () => {
  it('is not emitted when only the child route redeclares its own', () => {
    const names = emitted('/tasks/{taskId}', z.object({ taskId: z.string() })).map((one) => one.name)
    expect(names).toEqual(['taskId'])
  })

  it('is emitted once every ancestor is redeclared, which is what each builder here is for', () => {
    const names = emitted('/tasks/{taskId}', taskParams).map((one) => one.name)
    expect(names).toEqual(['projectId', 'taskId'])
  })

  it('is emitted as a required path parameter, never as a query one', () => {
    expect(emitted('/tasks/{taskId}', taskParams)).toEqual([
      expect.objectContaining({ name: 'projectId', in: 'path' }),
      expect.objectContaining({ name: 'taskId', in: 'path' }),
    ])
  })
})

describe('one builder per depth', () => {
  const cases = [
    ['projectParams', projectParams, ['projectId']],
    ['folderParams', folderParams, ['projectId', 'folderId']],
    ['taskParams', taskParams, ['projectId', 'taskId']],
    ['tabParams', tabParams, ['projectId', 'taskId', 'tabId']],
    ['shareLinkParams', shareLinkParams, ['projectId', 'token']],
  ] as const

  for (const [label, schema, expected] of cases) {
    it(`${label} carries every segment of its own path, ancestors first`, () => {
      expect(Object.keys(schema.shape)).toEqual(expected)
    })
  }
})

describe('what each builder accepts', () => {
  it('accepts a ULID for every entity id', () => {
    expect(tabParams.safeParse({ projectId: P1, taskId: T1, tabId: P1 }).success).toBe(true)
  })

  it('refuses an id that is not ULID-shaped, so a handler never builds a target from junk', () => {
    expect(projectParams.safeParse({ projectId: 'nope' }).success).toBe(false)
  })

  it('refuses a missing ancestor, which is what makes the redeclaration load-bearing at runtime too', () => {
    expect(taskParams.safeParse({ taskId: T1 }).success).toBe(false)
  })

  it('takes a share token rather than a ULID where a link is addressed by its token', () => {
    expect(shareLinkParams.safeParse({ projectId: P1, token: 'a'.repeat(32) }).success).toBe(true)
    expect(shareLinkParams.safeParse({ projectId: P1, token: 'short' }).success).toBe(false)
  })
})
