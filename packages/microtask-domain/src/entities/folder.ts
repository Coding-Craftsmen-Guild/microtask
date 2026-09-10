/** A one-level grouping of tasks inside a project. Folders never nest. */
export interface Folder {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly createdAt: string
  readonly updatedAt: string
}
