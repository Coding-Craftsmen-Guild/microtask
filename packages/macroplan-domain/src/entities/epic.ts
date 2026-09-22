import type { EpicBinding } from './binding.js'

/** A horizontal rail on the timeline: features are placed on it, never inside it. */
export interface PlanEpic {
  readonly id: string
  readonly name: string
  readonly colour: string
  readonly railOrder: number
  readonly binding: EpicBinding | null
  readonly createdAt: string
  readonly updatedAt: string
}
