import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describeProjectStore } from '@repo/kernel/testing'
import { FsProjectStore } from './fs-project-store.js'
import { NodeFileSystem } from './node-file-system.js'

describeProjectStore('FsProjectStore', () => {
  let root = ''
  const store = new FsProjectStore({
    files: new NodeFileSystem(),
    root: () => root,
  })
  return {
    store,
    async reset() {
      if (root) await rm(root, { recursive: true, force: true })
      root = await mkdtemp(path.join(tmpdir(), 'ccg-store-'))
    },
  }
})
