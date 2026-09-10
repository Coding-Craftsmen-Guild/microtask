import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Product } from '@repo/kernel'
import { NodeFileSystem } from '@repo/store'
import { describeProjectStore } from '../testing/index.js'
import { FsProjectStore } from './fs-project-store.js'
import { projectsDir, taskFile } from './paths.js'

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
    async writeUndecodableTask(product: Product, projectId: string, taskId: string, raw: string) {
      const file = taskFile(root, product, projectId, taskId)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, raw)
    },
    async addContainerWithoutManifest(product: Product, name: string) {
      await mkdir(path.join(projectsDir(root, product), name), { recursive: true })
    },
  }
})
