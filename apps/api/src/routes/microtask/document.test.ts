import { describe, expect, it } from 'vitest'
import { docConfig } from '../../http/docs.js'
import { GUARDED_PREFIX, buildApp } from '../../testing/harness.js'

const PROJECT = `${GUARDED_PREFIX}/projects/{projectId}`

interface Operation {
  readonly parameters?: {
    name: string
    in: string
    required?: boolean
    schema?: { default?: string; enum?: string[] }
  }[]
}

const operations = async (): Promise<Record<string, Record<string, Operation>>> => {
  const document = (await buildApp()).getOpenAPI31Document(docConfig)
  return (document.paths ?? {}) as Record<string, Record<string, Operation>>
}

const componentNames = async (): Promise<string[]> => {
  const document = (await buildApp()).getOpenAPI31Document(docConfig)
  return Object.keys(document.components?.schemas ?? {})
}

const cases: readonly (readonly [string, string, readonly string[]])[] = [
  [`${GUARDED_PREFIX}/projects`, 'get', []],
  [`${GUARDED_PREFIX}/projects`, 'post', []],
  [`${GUARDED_PREFIX}/search`, 'get', []],
  [`${GUARDED_PREFIX}/shares/current`, 'get', []],
  [`${GUARDED_PREFIX}/export`, 'get', []],
  [`${GUARDED_PREFIX}/import/sessions`, 'post', []],
  [`${GUARDED_PREFIX}/import/sessions/{sessionId}/files`, 'post', ['sessionId']],
  [`${GUARDED_PREFIX}/import/sessions/{sessionId}/archives`, 'post', ['sessionId']],
  [PROJECT, 'get', ['projectId']],
  [PROJECT, 'patch', ['projectId']],
  [PROJECT, 'delete', ['projectId']],
  [`${PROJECT}/export`, 'get', ['projectId']],
  [`${PROJECT}/folders`, 'get', ['projectId']],
  [`${PROJECT}/folders`, 'post', ['projectId']],
  [`${PROJECT}/folders/reorder`, 'post', ['projectId']],
  [`${PROJECT}/folders/{folderId}`, 'patch', ['projectId', 'folderId']],
  [`${PROJECT}/folders/{folderId}`, 'delete', ['projectId', 'folderId']],
  [`${PROJECT}/tasks`, 'post', ['projectId']],
  [`${PROJECT}/tasks/reorder`, 'post', ['projectId']],
  [`${PROJECT}/tasks/{taskId}`, 'get', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}`, 'patch', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}`, 'delete', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}/move`, 'post', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}/tabs`, 'post', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}/tabs/reorder`, 'post', ['projectId', 'taskId']],
  [`${PROJECT}/tasks/{taskId}/tabs/{tabId}`, 'patch', ['projectId', 'taskId', 'tabId']],
  [`${PROJECT}/tasks/{taskId}/tabs/{tabId}`, 'delete', ['projectId', 'taskId', 'tabId']],
  [`${PROJECT}/tasks/{taskId}/tabs/{tabId}/document`, 'put', ['projectId', 'taskId', 'tabId']],
  [`${PROJECT}/share-links`, 'get', ['projectId']],
  [`${PROJECT}/share-links`, 'post', ['projectId']],
  [`${PROJECT}/share-links/{token}`, 'patch', ['projectId', 'token']],
  [`${PROJECT}/share-links/{token}`, 'delete', ['projectId', 'token']],
]

describe('every operation these routes add is in the emitted document', () => {
  for (const [path, method, expected] of cases) {
    it(`declares ${method.toUpperCase()} ${path}`, async () => {
      expect((await operations())[path]?.[method]).toBeDefined()
    })

    it(`emits every ancestor path parameter for ${method.toUpperCase()} ${path}`, async () => {
      const found = (await operations())[path]?.[method]?.parameters ?? []
      const inPath = found.filter((one) => one.in === 'path')
      expect(inPath.map((one) => one.name)).toEqual([...expected])
      expect(found.every((one) => ['path', 'header', 'query'].includes(one.in))).toBe(true)
    })
  }

  it('adds no operation this list does not name, so a new route has to be described here', async () => {
    const listed = cases.map(([path, method]) => `${method} ${path}`).sort()
    const emitted = Object.entries(await operations())
      .filter(([path]) => path.startsWith(GUARDED_PREFIX))
      .flatMap(([path, item]) => Object.keys(item).map((method) => `${method} ${path}`))
      .sort()
    expect(emitted).toEqual(listed)
  })
})

describe('the parameters that are not path segments', () => {
  const parameters = async (path: string, method: string): Promise<Operation['parameters']> =>
    (await operations())[path]?.[method]?.parameters ?? []

  it('names the precondition header in canonical mixed case, as the client must send it', async () => {
    const found = await parameters(`${PROJECT}/tasks/{taskId}/tabs/{tabId}/document`, 'put')
    expect(found?.filter((one) => one.in === 'header')).toMatchObject([
      { name: 'If-Match', in: 'header', required: true },
    ])
  })

  it('declares the search term as a required query parameter', async () => {
    const found = await parameters(`${GUARDED_PREFIX}/search`, 'get')
    expect(found).toMatchObject([{ name: 'q', in: 'query', required: true }])
  })

  it('gives the bootstrap call no parameter of any kind, so no credential can reach a log', async () => {
    expect(await parameters(`${GUARDED_PREFIX}/shares/current`, 'get')).toEqual([])
  })

  it('declares the export disposition optional, defaulting to the one that carries no token', async () => {
    for (const path of [`${GUARDED_PREFIX}/export`, `${PROJECT}/export`]) {
      const found = (await parameters(path, 'get'))?.filter((one) => one.in === 'query')
      expect(found).toMatchObject([{ name: 'tokens', in: 'query', required: false }])
      expect(found?.[0]?.schema).toMatchObject({ default: 'strip', enum: ['strip', 'preserve'] })
    }
  })
})

describe('the statuses a route promises beyond the common set', () => {
  const statusesOf = async (path: string, method: string): Promise<string[]> => {
    const operation = (await operations())[path]?.[method] as { responses?: object } | undefined
    return Object.keys(operation?.responses ?? {}).sort()
  }

  it('promises a conflict and a payload limit on the conditional write', async () => {
    const found = await statusesOf(`${PROJECT}/tasks/{taskId}/tabs/{tabId}/document`, 'put')
    expect(found).toContain('409')
    expect(found).toContain('413')
  })

  it('promises a conflict on both export routes, a task file that will not read being one', async () => {
    const declared = ['200', '401', '403', '404', '409', '422', '500']
    for (const path of [`${GUARDED_PREFIX}/export`, `${PROJECT}/export`]) {
      expect([path, await statusesOf(path, 'get')]).toEqual([path, declared])
    }
  })

  it('promises the common error set on every guarded operation, so none drops one quietly', async () => {
    const common = ['401', '403', '404', '422', '500']
    const missing = Object.entries(await operations())
      .filter(([path]) => path.startsWith(GUARDED_PREFIX))
      .flatMap(([path, item]) =>
        Object.entries(item).flatMap(([method, operation]) => {
          const declared = Object.keys((operation as { responses?: object }).responses ?? {})
          return common
            .filter((status) => !declared.includes(status))
            .map((status) => `${method} ${path} is missing ${status}`)
        }),
      )
    expect(missing).toEqual([])
  })

  it('promises the login route neither a 403 nor a 404, which it can never answer', async () => {
    const found = await statusesOf('/v1/auth/login', 'post')
    expect(found).toEqual(['200', '401', '422', '500'])
  })

  it('tells a client the conditional write’s body is mandatory, not optional', async () => {
    const path = `${PROJECT}/tasks/{taskId}/tabs/{tabId}/document`
    const operation = (await operations())[path]?.['put'] as { requestBody?: { required?: boolean } }
    expect(operation.requestBody?.required).toBe(true)
  })

  it('says the same of every body in the tree, since no route here has a meaningful empty one', async () => {
    const optional = Object.entries(await operations()).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, operation]) => {
          const declared = (operation as { requestBody?: { required?: boolean } }).requestBody
          return declared !== undefined && declared.required !== true
        })
        .map(([method]) => `${method} ${path}`),
    )
    expect(optional).toEqual([])
  })
})

describe('the route that is not a product route', () => {
  it('documents the login route outside the product subtree', async () => {
    expect((await operations())['/v1/auth/login']?.['post']).toBeDefined()
  })
})

describe('the schemas these routes are described by', () => {
  const wanted = [
    'AdminSession',
    'CreateShareLinkPayload',
    'CreateTaskPayload',
    'DocumentJson',
    'Folder',
    'FolderList',
    'ImportSession',
    'ImportStagedChunk',
    'LoginPayload',
    'MoveTaskPayload',
    'NamePayload',
    'ProjectList',
    'ProjectView',
    'ReorderFoldersPayload',
    'ReorderTabsPayload',
    'ReorderTasksPayload',
    'RevokedShareLinks',
    'SearchResults',
    'ShareLink',
    'ShareLinkList',
    'ShareView',
    'Tab',
    'TabDocumentSaved',
    'TabList',
    'TaskEntry',
    'TaskEntryList',
    'TaskView',
  ]

  for (const name of wanted) {
    it(`references ${name} as a component rather than inlining it`, async () => {
      expect(await componentNames()).toContain(name)
    })
  }
})
