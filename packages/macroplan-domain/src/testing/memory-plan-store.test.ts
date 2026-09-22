import { describePlanStore } from './plan-store-contract.js'
import { MemoryPlanStore } from './memory-plan-store.js'

describePlanStore('MemoryPlanStore', () => {
  const store = new MemoryPlanStore()
  return {
    store,
    async reset() {
      store.clear()
    },
    async writeUndecodableManifest(product, planId, raw) {
      store.putRawManifest(product, planId, raw)
    },
    async writeUndecodableItem(product, planId, itemId, raw) {
      store.putRawItem(product, planId, itemId, raw)
    },
    async addContainerWithoutManifest(product, name) {
      store.addContainer(product, name)
    },
  }
})
