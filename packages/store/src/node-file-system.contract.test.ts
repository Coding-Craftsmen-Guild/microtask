import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describeFileSystem } from '@repo/kernel/testing'
import { NodeFileSystem } from './node-file-system.js'

/**
 * How long one contract case may take, against vitest's 5,000 ms default.
 *
 * Every case here makes a temporary directory, writes a handful of small files into it and then
 * removes the tree — cheap in isolation: the 33 cases took 614 ms together, idle, on this box.
 * The budget is raised for the same reason `node-file-system.test.ts` raises it: inside a cold
 * `turbo run test` this shares one disk with every other task in the graph, and `mkdtemp` plus a
 * recursive delete are exactly the operations that stall under that contention. A real
 * regression here fails an assertion rather than merely slowing down, so a wide timeout costs
 * nothing and a narrow one buys flakes on a change in a package `@repo/store` cannot reach.
 */
const SLOW_IO_TIMEOUT_MS = 60_000

describeFileSystem(
  'NodeFileSystem',
  () => {
    let dir = ''
    return {
      files: new NodeFileSystem(),
      async reset() {
        if (dir) await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 })
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccg-file-system-'))
        return dir
      },
      async makeEmptyDir(target: string) {
        await fs.mkdir(target, { recursive: true })
      },
      async teardown() {
        if (dir) await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 })
        dir = ''
      },
    }
  },
  { timeout: SLOW_IO_TIMEOUT_MS },
)
