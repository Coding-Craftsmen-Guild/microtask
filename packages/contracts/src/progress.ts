import { z } from 'zod'

/** Counted checklist state. */
export const Progress = z
  .object({ done: z.number().int().min(0), total: z.number().int().min(0) })
  .meta({ id: 'Progress', description: 'Counted checklist state, derived from a document' })
