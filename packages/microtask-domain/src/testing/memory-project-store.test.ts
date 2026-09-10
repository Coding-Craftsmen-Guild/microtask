import { describeProjectStore } from './project-store-contract.js'
import { MemoryProjectStore } from './memory-project-store.js'

describeProjectStore('MemoryProjectStore', () => {
  const store = new MemoryProjectStore()
  return {
    store,
    async reset() {
      store.clear()
    },
    async writeRawTaskFile(product, projectId, taskId, raw) {
      store.putRawTask(product, projectId, taskId, raw)
    },
    async makeStrayProjectDir(product, name) {
      store.addContainer(product, name)
    },
  }
})
