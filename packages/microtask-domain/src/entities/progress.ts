/** Counted checklist state. Derived from a document, cached in the manifest. */
export interface Progress {
  readonly done: number
  readonly total: number
}

/** The progress of something with no checklist items. */
export const NO_PROGRESS: Progress = { done: 0, total: 0 }
