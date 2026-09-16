import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Decoded } from '@repo/api-client'
import type { ImportPreview } from '@repo/contracts'
import { HARVEST_FAILED } from './attempt'
import { UPLOAD_REFUSALS } from './refusal'
import { TransferConsole } from './transfer-console'
import type { TransferPorts } from './use-transfer'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'
const PROJECT = '01M240FB4GD6PF6V0PKZVF6FD9'

const opened = { sessionId: SESSION, openedAt: 'S', maxChunkBytes: 1_000_000, maxSessionBytes: 40_000_000 }

const group = {
  path: 'volume/projects/01P',
  shape: 'v2-project-directory',
  projectId: PROJECT,
  name: 'Acme rollout',
  manifestTaskCount: 2,
  taskFilesFound: 2,
  shareLinks: [],
  existsInTarget: true,
  outcome: 'importable',
  reasons: [],
} satisfies Decoded<typeof ImportPreview>['groups'][number]

const plan = { sessionId: SESSION, groups: [group] }

const sent: { url: string; init: RequestInit }[] = []

const harvestedPath = (url: string): string =>
  new URL(url, 'http://app.test').searchParams.get('path') ?? ''

const staged = (url: string, init: RequestInit): Response =>
  Response.json({
    path: harvestedPath(url),
    chunkBytes: (init.body as Blob).size,
    sessionBytes: (init.body as Blob).size,
  })

type MutablePorts = { -readonly [K in keyof TransferPorts]: TransferPorts[K] }

let ports: MutablePorts

const picked = (path: string): File => {
  const name = path.split('/').pop() ?? path
  const file = new File([name], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(staged(url, init))
  })
  ports = {
    onOpen: vi.fn(() => Promise.resolve({ ok: true as const, value: opened })),
    onExpand: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
    onPreview: vi.fn(() => Promise.resolve({ ok: true as const, value: plan })),
    onConfirm: vi.fn(() => Promise.resolve({ ok: true as const, value: { sessionId: SESSION, projects: [] } })),
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const mount = () => {
  render(<TransferConsole {...ports} />)
  const input = screen.getByLabelText(/choose a folder/i)
  const zone = document.body.querySelector('[data-slot="drop-zone"]')
  if (zone === null) throw new Error('the drop zone did not render')
  return { input, zone }
}

const pick = (input: HTMLElement, paths: readonly string[]): void => {
  Object.defineProperty(input, 'files', { configurable: true, value: paths.map(picked) })
  Object.defineProperty(input, 'value', { configurable: true, value: 'x', writable: true })
  fireEvent.change(input)
}

const notice = (): string => document.body.querySelector('[data-slot="transfer-notice"]')?.textContent ?? ''

const panel = (): Element | null => document.body.querySelector('[data-slot="transfer-panel"]')

describe('the console stages a harvest and renders the plan it came back with', () => {
  it('opens a session, uploads every picked file and previews the session', async () => {
    const { input } = mount()
    pick(input, ['volume/01P/project.json', 'volume/01P/tasks/01T.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    expect(ports.onOpen).toHaveBeenCalledTimes(1)
    expect(sent).toHaveLength(2)
    expect(ports.onPreview).toHaveBeenCalledWith(SESSION)
  })

  it('lists every harvested path, so a file lost between the drop and the plan is visible', async () => {
    const { input } = mount()
    pick(input, ['volume/01P/project.json', 'volume/01P/tasks/01T.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    expect(document.body.querySelector('[data-slot="harvested"]')?.textContent).toBe(
      '2 files harvested',
    )
  })

  it('renders the preview row the server described, refusals and all', async () => {
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(screen.getByLabelText('Import preview')).not.toBeNull()
    })
    expect(screen.getByLabelText('Import preview').textContent).toContain('volume/projects/01P')
  })

  it('confirms the session whose plan is on screen, with a choice for the colliding project', async () => {
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => {
      expect(ports.onConfirm).toHaveBeenCalledWith(SESSION, [{ projectId: PROJECT, choice: 'skip' }])
    })
  })

  it('renders what the confirm did once it has answered', async () => {
    ports.onConfirm = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          sessionId: SESSION,
          projects: [
            {
              path: 'volume/projects/01P',
              projectId: PROJECT,
              writtenProjectId: PROJECT,
              choice: 'replace' as const,
              outcome: 'replaced' as const,
              tasksWritten: 2,
              tasksRemoved: 0,
              shareLinksReminted: 0,
              shareLinksStranded: 0,
              reasons: [],
            },
          ],
        },
      }),
    )
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Import result')).not.toBeNull()
    })
  })
})

describe('a harvest that failed is never rendered as an empty success (ADR 0018)', () => {
  const broken = () => {
    const entry = {
      isFile: true,
      isDirectory: false,
      fullPath: '/volume/01P/project.json',
      file: (_onFile: unknown, onFailure?: (reason: unknown) => void) => {
        queueMicrotask(() => {
          onFailure?.(new Error('the file moved mid-drag'))
        })
      },
    }
    return { items: [{ webkitGetAsEntry: () => entry }], files: [] }
  }

  it('says so, and says nothing was uploaded', async () => {
    const { zone } = mount()
    fireEvent.drop(zone, { dataTransfer: broken() })
    await waitFor(() => {
      expect(notice()).toContain(HARVEST_FAILED)
    })
    expect(notice()).toContain('the file moved mid-drag')
  })

  it('renders no panel at all, so there is no "0 files harvested" heading over nothing', async () => {
    const { zone } = mount()
    fireEvent.drop(zone, { dataTransfer: broken() })
    await waitFor(() => {
      expect(notice()).not.toBe('')
    })
    expect(panel()).toBeNull()
  })

  it('opens no session and uploads nothing, since there is nothing to stage', async () => {
    const { zone } = mount()
    fireEvent.drop(zone, { dataTransfer: broken() })
    await waitFor(() => {
      expect(notice()).not.toBe('')
    })
    expect(ports.onOpen).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })

  it('announces it, so a screen reader hears the drop failed rather than nothing', async () => {
    const { zone } = mount()
    fireEvent.drop(zone, { dataTransfer: broken() })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(HARVEST_FAILED)
    })
  })
})

describe('a file the session refused is named against that file, beside the plan', () => {
  it('lists the path and the reason, and still renders the plan for what did land', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      if (harvestedPath(url).endsWith('01T.json')) {
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'too_large', maxBytes: 1_000_000 }), { status: 413 }),
        )
      }
      return Promise.resolve(staged(url, init))
    })
    const { input } = mount()
    pick(input, ['volume/01P/project.json', 'volume/01P/tasks/01T.json'])
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="upload-failures"]')).not.toBeNull()
    })
    expect(document.body.querySelector('[data-slot="failed-path"]')?.textContent).toBe(
      'volume/01P/tasks/01T.json',
    )
    expect(document.body.querySelector('[data-slot="failed-reason"]')?.textContent).toContain(
      '1,000,000 bytes',
    )
    expect(panel()).not.toBeNull()
  })

  it('gives two files that failed differently a row each, with their own reasons', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      const path = harvestedPath(url)
      if (path.endsWith('big.json')) {
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'too_large', maxBytes: 262_144 }), { status: 413 }),
        )
      }
      if (path.endsWith('late.json')) {
        return Promise.resolve(new Response(JSON.stringify({ code: 'not_found' }), { status: 404 }))
      }
      return Promise.resolve(staged(url, init))
    })
    const { input } = mount()
    pick(input, ['volume/01P/project.json', 'volume/01P/big.json', 'volume/01P/late.json'])
    await waitFor(() => {
      expect(document.body.querySelectorAll('[data-slot="failed-path"]')).toHaveLength(2)
    })
    const paths = [...document.body.querySelectorAll('[data-slot="failed-path"]')].map(
      (node) => node.textContent,
    )
    const reasons = [...document.body.querySelectorAll('[data-slot="failed-reason"]')].map(
      (node) => node.textContent ?? '',
    )
    expect(paths).toEqual(['volume/01P/big.json', 'volume/01P/late.json'])
    expect(new Set(reasons).size).toBe(2)
    expect(reasons[0]).toContain('262,144 bytes')
    expect(reasons[1]).toBe(UPLOAD_REFUSALS.missing)
    expect(document.body.querySelector('[data-slot="upload-failures"]')?.textContent).toContain(
      'were not staged',
    )
  })

  it('names the cap from the problem document rather than a number of its own', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ code: 'too_large', maxBytes: 262_144 }), { status: 413 })),
    )
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="failed-reason"]')).not.toBeNull()
    })
    const said = document.body.querySelector('[data-slot="failed-reason"]')?.textContent ?? ''
    expect(said).toContain('262,144 bytes')
    expect(said).not.toContain('1,000,000')
  })
})

describe('a refusal about the session itself replaces the plan with a sentence', () => {
  it('says why a session could not be opened, and renders no panel', async () => {
    ports.onOpen = vi.fn(() => Promise.resolve({ ok: false as const, status: 403, detail: 'not allowed' }))
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(notice()).toBe('not allowed')
    })
    expect(panel()).toBeNull()
  })

  it('says why a confirm was refused, keeping the plan so a choice can be changed', async () => {
    ports.onConfirm = vi.fn(() =>
      Promise.resolve({ ok: false as const, status: 409, detail: 'the store changed under it' }),
    )
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => {
      expect(notice()).toBe('the store changed under it')
    })
    expect(panel()).not.toBeNull()
  })

  it('says so when the staging run rejects outright, rather than sitting on the spinner', async () => {
    ports.onOpen = vi.fn(() => Promise.reject(new Error('NEXT_REDIRECT;/login?next=%2Ftransfer')))
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(notice()).toContain('NEXT_REDIRECT')
    })
    expect(document.body.querySelector('[data-slot="transfer-busy"]')).toBeNull()
    expect(panel()).toBeNull()
  })

  it('says so when a confirm rejects outright, keeping the plan and stopping the spinner', async () => {
    ports.onConfirm = vi.fn(() => Promise.reject(new Error('NEXT_REDIRECT;/login?next=%2Ftransfer')))
    const { input } = mount()
    pick(input, ['volume/01P/project.json'])
    await waitFor(() => {
      expect(panel()).not.toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => {
      expect(notice()).toContain('NEXT_REDIRECT')
    })
    expect(document.body.querySelector('[data-slot="transfer-busy"]')).toBeNull()
    expect(panel()).not.toBeNull()
  })

  it('asks the server to expand a dropped zip rather than opening it here', async () => {
    const { input } = mount()
    pick(input, ['drop/volume.zip'])
    await waitFor(() => {
      expect(ports.onExpand).toHaveBeenCalledWith(SESSION, 'drop/volume.zip')
    })
  })
})
