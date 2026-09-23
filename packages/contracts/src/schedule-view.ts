import { z } from 'zod'
import { EntityId } from './document.js'

/**
 * One feature's or item's placement on the axis, in working-day offsets from a plan's first
 * working day.
 *
 * `id` is carried here rather than left as a map key, because `@repo/schedule`'s
 * `ScheduleResult.days` is a `Map` and a `Map` does not survive `JSON.stringify` — the wire form
 * has to be an array, and an array of spans needs to say which feature or item each one belongs
 * to. `endDay` stays exclusive, matching the forward pass, so a client computing a bar's width
 * never has to remember to add one.
 */
export const ScheduleSpan = z
  .object({ id: EntityId, startDay: z.number().int(), endDay: z.number().int() })
  .meta({ id: 'ScheduleSpan', description: 'One feature or item, placed at a working-day offset' })

/** Feature ids caught in a mutual `dependsOn` cycle, none of them placed on the axis. */
export const ScheduleCycle = z
  .object({ featureIds: z.array(EntityId).readonly() })
  .meta({ id: 'ScheduleCycle', description: 'Feature ids caught in a dependency cycle' })

/**
 * A feature or item the forward pass left off the axis, and why.
 *
 * `'no-estimate'` covers it — or, for a feature, everything under it — having no duration to
 * place. `'in-cycle'` applies only to a feature caught in a `dependsOn` cycle, which drags every
 * item under it down too, whether or not those items carry estimates of their own.
 */
export const UnscheduledEntry = z
  .object({ id: EntityId, reason: z.enum(['no-estimate', 'in-cycle']) })
  .meta({ id: 'UnscheduledEntry', description: 'A feature or item left off the axis, and why' })

/**
 * A dependency the forward pass could not honour because it contradicts rail order, and the
 * feature that declared it.
 *
 * Neither a cycle nor an unscheduled entry: the feature named here *did* get a span, one of its
 * stated dependencies was merely set aside to produce it. A canvas that could not tell "this bar
 * ignores a dependency" from "this bar could not be placed" would have to guess which sentence to
 * show.
 */
export const IgnoredEdge = z
  .object({ featureId: EntityId, dependsOnId: EntityId })
  .meta({ id: 'IgnoredEdge', description: 'A dependency dropped to keep rail order, and who declared it' })

/**
 * The schedule crossed the wire: every span, every cycle, every unscheduled entry and every
 * ignored edge the forward pass produced.
 *
 * A schedule is computed from a plan, never stored beside one (spec §3.4) — this schema exists to
 * validate a response the API hands out, not a write it accepts. No route answers one on its own:
 * it travels nested in `PlanView`, the declared body of `GET /plans/{planId}`, of the plan create
 * and retime, and of each of the fourteen edits to a plan's rails, features and items — all of
 * which answer the whole plan precisely so its bars cannot disagree with what produced them.
 * `@repo/api-client` parses it through `PlanView` on the plan read, which is so far the only one of
 * those it calls; nothing parses one directly but this package's own tests.
 */
export const ScheduleView = z
  .object({
    spans: z.array(ScheduleSpan).readonly(),
    cycles: z.array(ScheduleCycle).readonly(),
    unscheduled: z.array(UnscheduledEntry).readonly(),
    ignoredEdges: z.array(IgnoredEdge).readonly(),
  })
  .meta({ id: 'ScheduleView', description: "A plan's schedule: spans, cycles, unscheduled entries, ignored edges" })
