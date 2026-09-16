import { describeFileSystem } from './file-system-contract.js'
import { MemoryFileSystem } from './memory-file-system.js'

describeFileSystem('MemoryFileSystem', () => {
  const files = new MemoryFileSystem()
  let run = 0
  return {
    files,
    async reset() {
      files.clear()
      run += 1
      return `/memory/run-${String(run)}`
    },
  }
})
