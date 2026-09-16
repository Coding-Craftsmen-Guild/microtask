import { beforeEach, describe, expect, it } from 'vitest'
import { harvestDrop, harvestPath, harvestPick } from './harvest'
import type { HarvestEntry, HarvestItem, HarvestReader, HarvestTransfer } from './harvest'

const CHROMIUM_BATCH = 100

const CHUNKS = [CHROMIUM_BATCH, 30, 20]

const picked = (path: string) => {
  const name = path.split('/').pop() ?? ''
  const file = new File([name], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

const loose = (name: string) => new File([name], name)

const fileEntry = (fullPath: string): HarvestEntry => ({
  isFile: true,
  isDirectory: false,
  fullPath,
  file: (onFile) => {
    queueMicrotask(() => {
      onFile(loose(fullPath.split('/').pop() ?? ''))
    })
  },
})

const readers: number[] = []

const directoryEntry = (fullPath: string, children: readonly HarvestEntry[]): HarvestEntry => ({
  isFile: false,
  isDirectory: true,
  fullPath,
  createReader: () => {
    const reader = readers.push(0) - 1
    let call = 0
    return {
      readEntries: (onEntries) => {
        const from = readers[reader] ?? 0
        const size = CHUNKS[call % CHUNKS.length] ?? CHROMIUM_BATCH
        call += 1
        const batch = children.slice(from, from + size)
        readers[reader] = from + batch.length
        queueMicrotask(() => {
          onEntries(batch)
        })
      },
    }
  },
})

const folder = (count: number) =>
  directoryEntry(
    '/volume',
    Array.from({ length: count }, (_, index) => fileEntry(`/volume/task-${String(index)}.json`)),
  )

interface DropSpec {
  readonly entries?: readonly HarvestEntry[]
  readonly asFiles?: readonly File[]
  readonly strings?: number
  readonly files?: readonly File[]
}

const dropped = (spec: DropSpec) => {
  let live = true
  const items: HarvestItem[] = [
    ...(spec.entries ?? []).map((entry) => ({ webkitGetAsEntry: () => (live ? entry : null) })),
    ...(spec.asFiles ?? []).map((file) => ({
      webkitGetAsEntry: () => null,
      getAsFile: () => (live ? file : null),
    })),
    ...Array.from({ length: spec.strings ?? 0 }, () => ({
      webkitGetAsEntry: () => null,
      getAsFile: () => null,
    })),
  ]
  const transfer: HarvestTransfer = {
    get items() {
      return live ? items : []
    },
    get files() {
      return live ? (spec.files ?? []) : []
    },
  }
  return {
    transfer,
    endDispatch: () => {
      live = false
    },
  }
}

const paths = (harvested: readonly { readonly path: string }[]) => harvested.map((one) => one.path)

const readerOf = (directory: HarvestEntry): HarvestReader => {
  const reader = directory.createReader?.()
  if (reader === undefined) throw new Error('the double was built without a reader')
  return reader
}

const readOnce = (reader: HarvestReader) =>
  new Promise<readonly HarvestEntry[]>((resolve) => {
    reader.readEntries(resolve)
  })

beforeEach(() => {
  readers.length = 0
})

describe('the doubles these tests rest on', () => {
  it('batches at 100 like Chromium, so one readEntries call cannot see a 150-file folder', async () => {
    const batch = await readOnce(readerOf(folder(150)))
    expect(batch.length).toBe(CHROMIUM_BATCH)
  })

  it('restarts a newly created reader from entry 0, which is what forbids a second one', async () => {
    const directory = folder(150)
    const opened = await readOnce(readerOf(directory))
    const restarted = await readOnce(readerOf(directory))
    expect(opened[0]?.fullPath).toBe('/volume/task-0.json')
    expect(restarted[0]?.fullPath).toBe('/volume/task-0.json')
  })

  it('varies a mid-stream batch, because Chromium documents 100 as a maximum and not a promise', async () => {
    const reader = readerOf(folder(150))
    const lengths: number[] = []
    for (let call = 0; call < 4; call += 1) {
      lengths.push((await readOnce(reader)).length)
    }
    const midStream = lengths.slice(0, -1)
    expect(midStream.filter((length) => length > 0 && length < CHROMIUM_BATCH).length,
    ).toBeGreaterThan(0)
    expect(midStream.every((length) => length > 0 && length <= CHROMIUM_BATCH)).toBe(true)
    expect(midStream.reduce((sum, length) => sum + length, 0)).toBe(150)
  })

  it('yields the empty array only once exhausted, so nothing short of it can mean done', async () => {
    const reader = readerOf(folder(150))
    const lengths: number[] = []
    for (let call = 0; call < 4; call += 1) {
      lengths.push((await readOnce(reader)).length)
    }
    expect(lengths.indexOf(0)).toBe(lengths.length - 1)
  })

  it('goes back to protected mode once dispatch ends, which is how a lost drop shows up', () => {
    const one = dropped({ entries: [fileEntry('/a.json')], files: [loose('b.json')] })
    expect(one.transfer.items.length).toBe(1)
    one.endDispatch()
    expect(one.transfer.items.length).toBe(0)
    expect(one.transfer.files.length).toBe(0)
  })
})

describe('harvestPath', () => {
  it('decodes a drop and a pick of one file into the same path, which is the whole job', () => {
    expect(harvestPath('/volume/projects/01P/project.json', 'project.json')).toBe(
      harvestPath('volume/projects/01P/project.json', 'project.json'),
    )
  })

  it('strips the leading separator a fullPath carries by spec, which the server refuses', () => {
    expect(harvestPath('/volume/projects/01P/project.json', 'project.json')).toBe(
      'volume/projects/01P/project.json',
    )
  })

  it('names a loose file by itself when the browser reports no path for it', () => {
    expect(harvestPath('', 'workspace.json')).toBe('workspace.json')
  })

  it('does not crash where webkitRelativePath is absent, as it is in happy-dom but in no browser', () => {
    expect(harvestPath(undefined, 'workspace.json')).toBe('workspace.json')
  })

  it('normalises nothing else, because the server collapses "//" and "." and this must not drift', () => {
    expect(harvestPath('volume//projects/./01P/project.json', 'project.json')).toBe(
      'volume//projects/./01P/project.json',
    )
  })

  it('hands a ".." path to the server still carrying it, rather than sanitising a refusal away', () => {
    expect(harvestPath('/../escape.json', 'escape.json')).toBe('../escape.json')
  })

  it('leaves a backslash alone, so the server refuses the path rather than this translating it', () => {
    expect(harvestPath('volume\\projects\\project.json', 'project.json')).toBe(
      'volume\\projects\\project.json',
    )
  })

  it('strips exactly one separator, so a doubled one stays absolute and is still refused', () => {
    expect(harvestPath('//volume/project.json', 'project.json')).toBe('/volume/project.json')
  })
})

describe('harvestPick', () => {
  it('carries the picked directory path of every file the input reported', () => {
    const files = [
      picked('volume/projects/01P/project.json'),
      picked('volume/projects/01P/tasks/01T.json'),
    ]
    expect(paths(harvestPick(files))).toEqual([
      'volume/projects/01P/project.json',
      'volume/projects/01P/tasks/01T.json',
    ])
  })

  it('keeps the File itself beside its path, since the body has to carry the bytes', () => {
    const file = picked('volume/project.json')
    expect(harvestPick([file])[0]?.file).toBe(file)
  })

  it('harvests nothing from an input that was cancelled, rather than throwing on a null list', () => {
    expect(harvestPick(null)).toEqual([])
  })

  it('classifies a loose file with no path individually, under its own name', () => {
    expect(paths(harvestPick([loose('workspace.json')]))).toEqual(['workspace.json'])
  })
})

describe('harvestDrop', () => {
  it('harvests all 150 files of a dropped folder, though readEntries batches at 100', async () => {
    const { transfer } = dropped({ entries: [folder(150)] })
    const harvested = await harvestDrop(transfer)
    expect(harvested.length).toBe(150)
    expect(paths(harvested)).toContain('volume/task-149.json')
  })

  it('keeps reading past a batch shorter than the last, since only the empty array ends one', async () => {
    const { transfer } = dropped({ entries: [folder(150)] })
    const harvested = await harvestDrop(transfer)
    expect(paths(harvested)).toContain('volume/task-130.json')
    expect(harvested.length).toBe(150)
  })

  it('pumps one reader per directory, because creating a second restarts it from entry 0', async () => {
    const { transfer } = dropped({ entries: [folder(150)] })
    await harvestDrop(transfer)
    expect(readers.length).toBe(1)
  })

  it('decodes a dropped fullPath into the same encoding a pick of the same tree produces', async () => {
    const { transfer } = dropped({
      entries: [directoryEntry('/volume', [fileEntry('/volume/projects/01P/project.json')])],
    })
    expect(paths(await harvestDrop(transfer))).toEqual(
      paths(harvestPick([picked('volume/projects/01P/project.json')])),
    )
  })

  it('walks a nested directory, so a dropped volume brings its projects and their tasks', async () => {
    const tasks = directoryEntry('/volume/01P/tasks', [fileEntry('/volume/01P/tasks/01T.json')])
    const project = directoryEntry('/volume/01P', [fileEntry('/volume/01P/project.json'), tasks])
    const { transfer } = dropped({ entries: [directoryEntry('/volume', [project])] })
    expect([...paths(await harvestDrop(transfer))].sort()).toEqual([
      'volume/01P/project.json',
      'volume/01P/tasks/01T.json',
    ])
  })

  it('loses the drop when anything is awaited before the items are read, which is the bug', async () => {
    const { transfer, endDispatch } = dropped({ entries: [folder(3)] })
    const naive = async () => {
      await Promise.resolve()
      return harvestDrop(transfer)
    }
    const pending = naive()
    endDispatch()
    expect(await pending).toEqual([])
  })

  it('harvests the whole drop when the items are read in the dispatch, then the store protects', async () => {
    const { transfer, endDispatch } = dropped({ entries: [folder(3)] })
    const pending = harvestDrop(transfer)
    endDispatch()
    expect((await pending).length).toBe(3)
  })

  it('takes the files of a browser with no entries API, so a drop is not silently empty there', async () => {
    const { transfer } = dropped({ asFiles: [loose('workspace.json')] })
    expect(paths(await harvestDrop(transfer))).toEqual(['workspace.json'])
  })

  it('falls back to the transfer files when the item list itself is empty', async () => {
    const { transfer } = dropped({ files: [loose('workspace.json')] })
    expect(paths(await harvestDrop(transfer))).toEqual(['workspace.json'])
  })

  it('rejects rather than reporting a short harvest when a directory read fails', async () => {
    const broken: HarvestEntry = {
      isFile: false,
      isDirectory: true,
      fullPath: '/volume',
      createReader: () => ({
        readEntries: (_onEntries, onError) => {
          onError?.(new Error('read failed'))
        },
      }),
    }
    const { transfer } = dropped({ entries: [broken] })
    await expect(harvestDrop(transfer)).rejects.toThrow('read failed')
  })

  it('rejects rather than losing a whole subtree when a directory offers no reader at all', async () => {
    const unreadable: HarvestEntry = { isFile: false, isDirectory: true, fullPath: '/volume/01P' }
    const { transfer } = dropped({
      entries: [directoryEntry('/volume', [fileEntry('/volume/project.json'), unreadable])],
    })
    await expect(harvestDrop(transfer)).rejects.toThrow('offers no reader')
  })

  it('rejects an entry claiming to be neither a file nor a directory, rather than reading it as one', async () => {
    const neither: HarvestEntry = {
      isFile: false,
      isDirectory: false,
      fullPath: '/volume/project.json',
      file: (onFile) => {
        onFile(loose('project.json'))
      },
    }
    const { transfer } = dropped({ entries: [neither] })
    await expect(harvestDrop(transfer)).rejects.toThrow('neither file nor directory')
  })

  it('does not take the transfer files as well, since they mirror the items and would double it', async () => {
    const file = loose('workspace.json')
    const { transfer } = dropped({ asFiles: [file], files: [file] })
    expect(paths(await harvestDrop(transfer))).toEqual(['workspace.json'])
  })

  it('harvests nothing from a string item, which is in no file list either and so cannot be lost', async () => {
    const { transfer } = dropped({ strings: 1 })
    expect(await harvestDrop(transfer)).toEqual([])
  })

  it('reads a file item beside a string one without the string reaching the files fallback', async () => {
    const file = loose('workspace.json')
    const { transfer } = dropped({ asFiles: [file], strings: 1, files: [file] })
    expect(paths(await harvestDrop(transfer))).toEqual(['workspace.json'])
  })

  it('rejects rather than reporting a short harvest when one file cannot be read', async () => {
    const broken: HarvestEntry = {
      isFile: true,
      isDirectory: false,
      fullPath: '/volume/project.json',
      file: (_onFile, onError) => {
        onError?.(new Error('file gone'))
      },
    }
    const { transfer } = dropped({ entries: [broken] })
    await expect(harvestDrop(transfer)).rejects.toThrow('file gone')
  })
})
