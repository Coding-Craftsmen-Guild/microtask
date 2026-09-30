import { z } from 'zod'
import { EntityId } from './document.js'

/**
 * A point on the working-day axis, counted from a plan's first working day.
 *
 * ### Why it is not a whole number
 *
 * They were, and that was correct while `EstimateDays` was. It is halves now, and the forward pass
 * is arithmetic on these offsets — `endDay = startDay + estimate` — so a half-day feature ends half
 * a day in and everything queued behind it is offset by the same half. Keeping `int()` here did not
 * prevent that; it only meant the API served a schedule that failed its own contract, and the client
 * refused to decode the response as unreachable. The grain of a *span* is whatever the grain of an
 * estimate is, so it is stated once, there, and followed here.
 *
 * The offsets stay `multipleOf(0.5)` rather than becoming a free `number` because a span is a sum of
 * estimates and nothing else: an offset that is not a multiple of a half is a schedule arrived at by
 * some route the domain does not have, and worth refusing at the boundary.
 *
 * {@link DayOffset} is a named schema rather than an inline `z.number()` so that the grain lands on
 * the **number** in the published document. `@hono/zod-openapi` carries a known subset of keywords
 * through and drops `multipleOf`, so it is restated in `.meta()` — and `.meta()` applies to whatever
 * node it is written on, so stating it on the span object would have hung a numeric keyword off an
 * object, where it means nothing at all.
 */
export const DayOffset = z
  .number()
  .multipleOf(0.5)
  .meta({
    id: 'DayOffset',
    description: 'A working-day offset from the plan start, in halves',
    multipleOf: 0.5,
  })

/**
 * One feature's or item's placement on the axis, as two {@link DayOffset}s.
 *
 * `id` is carried here rather than left as a map key, because `@repo/schedule`'s
 * `ScheduleResult.days` is a `Map` and a `Map` does not survive `JSON.stringify` — the wire form has
 * to be an array, and an array of spans needs to say which feature or item each one belongs to.
 * `endDay` stays exclusive, matching the forward pass, so a client computing a bar's width never has
 * to remember to add one.
 */
export const ScheduleSpan = z
  .object({ id: EntityId, startDay: DayOffset, endDay: DayOffset })
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
