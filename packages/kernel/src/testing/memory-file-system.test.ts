import { describeFileSystem } from './file-system-contract.js'
import { MemoryFileSystem } from './memory-file-system.js'

describeFileSystem('MemoryFileSystem', () => {
  const files = new MemoryFileSystem()
  return {
    files,
    async reset() {
      files.clear()
      return '/memory'
    },
  }
})
