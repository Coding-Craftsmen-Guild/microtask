import type { DocumentJson } from './document.js'

/** One tab inside a task, owning its own document. */
export interface Tab {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly document: DocumentJson
  readonly createdAt: string
  readonly updatedAt: string
}
