import type { Tab } from './tab.js'

/** The contents of one task file: its tabs and nothing else. */
export interface TaskDocument {
  readonly id: string
  readonly tabs: readonly Tab[]
  readonly createdAt: string
  readonly updatedAt: string
}
