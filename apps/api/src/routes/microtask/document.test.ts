import { describe, expect, it } from 'vitest'
import { docConfig } from '../../http/docs.js'
import { GUARDED_PREFIX, buildApp } from '../../testing/harness.js'

const PROJECT = `${GUARDED_PREFIX}/projects/{projectId}`

interface Operation {
  readonly parameters?: { name: string; in: string }[]
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
  [PROJECT, 'get', ['projectId']],
  [PROJECT, 'patch', ['projectId']],
  [PROJECT, 'delete', ['projectId']],
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
]

describe('every operation these routes add is in the emitted document', () => {
  for (const [path, method, expected] of cases) {
    it(`declares ${method.toUpperCase()} ${path}`, async () => {
      expect((await operations())[path]?.[method]).toBeDefined()
    })

    it(`emits every ancestor path parameter for ${method.toUpperCase()} ${path}`, async () => {
      const found = (await operations())[path]?.[method]?.parameters ?? []
      expect(found.map((one) => one.name)).toEqual([...expected])
      expect(found.every((one) => one.in === 'path')).toBe(true)
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

describe('the schemas these routes are described by', () => {
  const wanted = [
    'CreateTaskPayload',
    'Folder',
    'FolderList',
    'MoveTaskPayload',
    'NamePayload',
    'ProjectList',
    'ProjectView',
    'ReorderFoldersPayload',
    'ReorderTasksPayload',
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
