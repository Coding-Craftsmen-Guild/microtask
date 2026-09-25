import { dropTargetFor } from '@repo/canvas'
import type { DragPoint, DropTarget, FeatureBar, PlanScale, RailBox } from '@repo/canvas'
import { LAYOUT, railTop } from './view'

const SEPARATOR = ' '

const BAR = '[data-slot="feature-bar"]'

const PLACED = `${BAR}:not([data-placed="false"])`

const RAIL = '[data-slot="rail"]'

const numberAt = (element: Element, name: string): number => Number(element.getAttribute(name))

const splitRailIds = (joined: string | null): readonly string[] =>
  joined === null || joined === '' ? [] : joined.split(SEPARATOR)

const barOf = (bar: Element): FeatureBar => ({
  id: bar.getAttribute('data-feature-id') ?? '',
  startDay: numberAt(bar, 'data-start-day'),
  endDay: numberAt(bar, 'data-end-day'),
  x: numberAt(bar, 'x'),
  width: numberAt(bar, 'width'),
})

const railBoxOf = (rail: Element): RailBox => ({
  epicId: rail.getAttribute('data-epic-id') ?? '',
  colour: rail.getAttribute('data-colour'),
  featureIds: splitRailIds(rail.getAttribute('data-feature-ids')),
  bars: [...rail.querySelectorAll(PLACED)].map(barOf),
})

/**
 * Every feature on one rail, in the one order `railLayout` derived, joined for one attribute.
 *
 * A space is safe because `EntityId` is a ULID — `/^[0-9A-HJKMNP-TV-Z]{26}$/`, which holds no space —
 * so the join is reversible and this is the same device `./drawer/field.ts`'s `joinEdges` uses for the
 * same reason. It is the **whole** rail and not its bars: `RailBox.featureIds` includes the features
 * the forward pass could not place, `bars` is a subsequence of it, and `dropTargetFor` needs the wider
 * list to answer a stored position rather than a bar index — "a rail's features are not its bars, so no
 * count of bars is the answer" (`packages/canvas/src/drag.ts`).
 *
 * Nothing on the canvas reads it back; {@link railsFrom} does. It is on the rail's own `<g>` rather than
 * one attribute per feature because the interleaving is the information: a rail draws its unplaced
 * features as gutter stubs **before** its bars, so the two runs of ids are each in order and the order
 * *between* them is recoverable from no per-element attribute.
 *
 * @param ids - The rail's features, in the order the layout returned them.
 * @returns One attribute value, which {@link railsFrom} splits back into the same array.
 */
export const joinRailIds = (ids: readonly string[]): string => ids.join(SEPARATOR)

/**
 * The layout a canvas was drawn from, read back off the canvas it drew.
 *
 * ### Why the drop is resolved against the markup and not against a prop
 *
 * `dropTargetFor` takes the whole `railLayout` result, and a client component may be handed primitives,
 * an unbound function or `null` and nothing else (`../module-boundaries.test.tsx`) — so the layout
 * cannot cross into `./drag-root.tsx` as a prop, and the plan it was derived from may not cross at all.
 * What is left is the SVG, which every one of those numbers is already written into. So this is not a
 * workaround for the boundary: the drop is answered against **what is on screen**, which is the one copy
 * of the layout the user can actually see, rather than against a second copy that a re-render could have
 * left behind.
 *
 * Every number comes off an attribute the server wrote, and nothing here measures anything: ADR 0055
 * exists because `happy-dom` answers `getBoundingClientRect` with a zero `DOMRect`, and an attribute is
 * not a measurement. `canvas/feature-bar.tsx` says why a bar carries `data-start-day` and
 * `data-end-day`, and {@link joinRailIds} why a rail carries `data-feature-ids`.
 *
 * ### The indices have to be the ones `railTop` was called with
 *
 * `railAtY` "is identified here by its index in that array", so the order matters: rails come back in
 * document order, which is the order `PlanCanvas` mapped them in and therefore the order it called
 * `railTop(index)` with. Nothing filters or re-sorts, for that reason.
 *
 * A rail's `colour` is `null` exactly when the `data-colour` attribute is absent, which is what
 * `canvas/rail.tsx` writes for a rail no epic claims — the same `null` `railLayout` answers, and the one
 * `dropTargetFor` refuses a drop on.
 *
 * `bars` excludes `[data-placed="false"]`, which is the gutter stub `canvas/unplaced-features.tsx` draws
 * for a feature with no span. A stub is not a bar: it carries the same `data-slot` so that one grab
 * resolves either, and `railLayout` omits exactly those features from `bars` while keeping them in
 * `featureIds`.
 *
 * @param svg - The canvas's own `<svg>`, or any ancestor of it.
 * @returns One box per rail, in the order they were drawn, equal to what `railLayout` answered.
 */
export const railsFrom = (svg: Element): readonly RailBox[] =>
  [...svg.querySelectorAll(RAIL)].map(railBoxOf)

/** What one pointer went down on: the feature, its rail, and the rect's own geometry. */
export interface Grabbed {
  /** The feature the grabbed bar or stub was drawn for. */
  readonly featureId: string

  /** The epic naming the rail it was drawn on, which is how a rail is keyed. */
  readonly epicId: string

  /** Its own left edge in user units, straight off the `x` attribute. */
  readonly x: number

  /** Its own top in user units, which is where a ghost of it starts. */
  readonly y: number

  /** Its own width in user units, so a ghost is the size of the thing being moved. */
  readonly width: number
}

/**
 * The bar or stub a pointer event landed on, or `null` for an event that hit neither.
 *
 * `closest` rather than a hit test, which is the whole reason phase 2's markup is shaped the way it is:
 * every bar and stub already carries `data-feature-id` and `data-slot`, so the browser answers which one
 * was hit and no geometry is compared. `canvas/feature-bar.tsx` closed the alternative — a transparent
 * sheet over the bars "would swallow the drag and the click it adds" — and this needs none, because the
 * listener is on the element **wrapping** the canvas and the target is read out of the event.
 *
 * A gutter stub answers too, and that is deliberate: `data-placed="false"` marks it as no bar for
 * {@link railsFrom}, but it is a real feature at a real place on a real rail, and dragging one onto the
 * axis is how an unsized feature gets ordered. `dropTargetFor` already answers for a dragged feature its
 * rail draws no bar for.
 *
 * @param target - `event.target`, which may be the `<svg>`, a band, a tick, a mark or nothing.
 * @returns What was grabbed, or `null` when the event hit no bar and no stub.
 */
export function grabbedAt(target: EventTarget | null): Grabbed | null {
  const bar = target instanceof Element ? target.closest(BAR) : null
  const featureId = bar?.getAttribute('data-feature-id') ?? null
  const epicId = bar?.closest(RAIL)?.getAttribute('data-epic-id') ?? null
  if (bar === null || featureId === null || epicId === null) return null
  return {
    featureId,
    epicId,
    x: numberAt(bar, 'x'),
    y: numberAt(bar, 'y'),
    width: numberAt(bar, 'width'),
  }
}

/** Where a drag started, in the two numbers the point it becomes is measured from. */
export interface Anchor {
  /** The dragged bar's own left edge, as {@link Grabbed} read it off the rect. */
  readonly barX: number

  /** The top of the band the drag began in: `railTop` of that rail's index. */
  readonly railTop: number
}

/**
 * A pair of numbers in the canvas's own user units: a distance travelled, or a place arrived at.
 *
 * One shape for both because a drag is a place plus a displacement and the two are added — naming them
 * apart would be two interfaces of two numbers each and one conversion between them that is the identity.
 */
export interface Travelled {
  /** Rightward is positive. */
  readonly x: number

  /** Downward is positive. */
  readonly y: number
}

/**
 * The point a drag has reached, in the form `dropTargetFor` reads: the **bar's** place, not the
 * pointer's.
 *
 * Both members of a `DragPoint` are contracts and a raw pointer coordinate satisfies neither, which is
 * why this is a named function with its own test rather than two expressions at a call site. The
 * package's own words, and the arithmetic here is the same two sentences with the subtraction folded
 * into a delta:
 *
 * - `x` is "the dragged bar's **left edge**: `pointerX - (pointerDownX - bar.x)`", because
 *   `dropTargetFor` compares it against each bar's own `x`. Handing over the pointer's x instead "reads
 *   as a drag that travelled that offset further than it did, so 'dropped where it began changes
 *   nothing' fails by it" — at `CANVAS_SCALE`'s 14px per day, a five-day bar grabbed near its right end
 *   and released without moving reads 70px, five days and two siblings, from where it is.
 * - `y` is the y the bar's band-relative **centre** landed at:
 *   `pointerY - (pointerDownY - railTop(the rail the drag started on)) + railHeight / 2`. A
 *   `FeatureBar` carries no `y` to subtract — where a bar sits inside its band is this app's business
 *   and `RailMetrics` deliberately does not carry it — so the band's own top is what the offset is taken
 *   against. The half band is "the reason for the offset and not a fudge": `railAtY` gives every band
 *   edge to the band below it, so half a band each way is what makes the handoff symmetric. Without it
 *   the rail below is a full band away and the rail above is one pixel.
 *
 * Written as `anchor + delta` rather than as the subtraction, because the two are the same number and
 * only one of them is testable: a delta in user units needs no `getCTM` and no `DOMRect`, which
 * `happy-dom` answers with an identity matrix and a zero rect. `./drag-root.tsx` holds the one line that
 * turns a client-pixel delta into a user-unit one, and says why no test in this repository can check it.
 *
 * @param from - The bar's own x and the top of the band it was grabbed in.
 * @param by - The pointer's travel since it went down, already in user units.
 * @returns The point to hand `dropTargetFor`, with no day, rail or position computed here.
 */
export const dragPoint = (from: Anchor, by: Travelled): DragPoint => ({
  x: from.barX + by.x,
  y: from.railTop + by.y + LAYOUT.railHeight / 2,
})

/**
 * User units per client pixel, for a canvas rendered at `renderedWidth` client pixels.
 *
 * The canvas sets `width` in px to the same number its `viewBox` is wide, and `PlanScreen` puts it in a
 * `shrink-0` horizontal scroller, so in a browser this is 1 and a pointer pixel is a user unit. It is
 * still arithmetic rather than the constant 1, because a canvas the layout did squeeze — a future zoom
 * control, a print stylesheet — would otherwise move a bar by the wrong distance with nothing failing.
 *
 * A `renderedWidth` of 0 answers 1 rather than dividing by it, and that case is not hypothetical twice
 * over: `happy-dom` measures every element as a zero `DOMRect`, and a browser measures the canvas as
 * zero while the table view is chosen, `PlanScreen` hiding it with `display:none`. Both want the same
 * answer — assume the canvas is at its own scale — and `Infinity` in a coordinate would put a ghost
 * nowhere and send a placement off the axis.
 *
 * @param viewBoxWidth - The canvas's own width in user units, which is its `viewBox`'s third number.
 * @param renderedWidth - What it measures on screen, or 0 where nothing can be measured.
 * @returns The factor a client-pixel delta is multiplied by, never 0 and never infinite.
 */
export const userScale = (viewBoxWidth: number, renderedWidth: number): number =>
  renderedWidth > 0 ? viewBoxWidth / renderedWidth : 1

/**
 * Whether a dragged bar's left edge landed in the label gutter rather than on the axis.
 *
 * `dropTargetFor` refuses a point whose x names a day before **day 0**, and on a canvas starting at day
 * 0 that is exactly the gutter. It stops being the gutter the moment anything pans: `view.ts`'s
 * `gutterX` exists because "a viewport scrolled to day 40 has its gutter at `dayToX(40) - 160`", so the
 * label gutter of a panned canvas sits over positive days and a drop on a rail's **name** would be
 * answered as a placement. Nothing pans today — `CANVAS_RANGE` is `{fromDay: 0, toDay: 60}` — but this
 * is the first module to send a placement from a pointer, so the refusal is asked here against the axis
 * the canvas was actually drawn from rather than left as a precondition in prose.
 *
 * It is the **bar's** left edge and not the pointer's, for {@link dragPoint}'s reason, and the gutter is
 * where a rail's unplaced features are drawn: a stub dragged nowhere lands back in the gutter and is
 * cancelled, which is the same answer as dropping it off the canvas.
 *
 * @param x - The dragged bar's left edge in user units.
 * @param axisX - The x of the canvas's first day, which is `RailFrame.axisX`.
 * @returns `true` for a drop to cancel.
 */
export const inGutter = (x: number, axisX: number): boolean => x < axisX

const NOWHERE: Travelled = { x: 0, y: 0 }

/** One `<svg>`'s own box, off the three attributes it was drawn with. */
export interface CanvasBox {
  /** Its `viewBox` verbatim, so an overlay drawn with it maps user units the same way. */
  readonly viewBox: string

  /** Its `width` in px, which on this canvas is also its width in user units. */
  readonly width: number

  /** Its `height` in px. */
  readonly height: number
}

const boxOf = (canvas: Element): CanvasBox => ({
  viewBox: canvas.getAttribute('viewBox') ?? '',
  width: numberAt(canvas, 'width'),
  height: numberAt(canvas, 'height'),
})

/** One drag in progress, in the numbers a placement is answered from and nothing of the pointer. */
export interface Held {
  /** The bar or stub the pointer went down on. */
  readonly grabbed: Grabbed

  /** The whole layout, unfiltered and in the order it was drawn — {@link railsFrom}'s answer. */
  readonly rails: readonly RailBox[]

  /** The top of the band the drag began in, which is `railTop` of that rail's own index. */
  readonly railTop: number

  /** The box of the canvas being dragged on, which is the box the ghost over it is drawn in. */
  readonly box: CanvasBox

  /** How far the pointer has travelled since it went down, already in user units. */
  readonly travelled: Travelled
}

/** Where one pointer went down, in client px, and the factor its travel is converted by. */
export interface Origin {
  /** The `clientX` of the `pointerdown`. */
  readonly x: number

  /** Its `clientY`. */
  readonly y: number

  /** User units per client px, from {@link userScale}. */
  readonly factor: number
}

/**
 * The origin to hold for a drag that began at `at` on a canvas measuring `renderedWidth` px.
 *
 * The one caller of {@link userScale}, and the reason it is a function rather than two fields written at
 * the call site: `renderedWidth` is the single measurement in this whole affordance, and having the
 * arithmetic over it live here means the untestable line at the call site is the measurement alone.
 *
 * @param at - The `pointerdown`'s client coordinates.
 * @param box - The canvas's own box, whose width is its width in user units.
 * @param renderedWidth - What the canvas measures on screen, or 0 where nothing can be measured.
 * @returns The origin every later pointer position is read against.
 */
export const originAt = (at: Travelled, box: CanvasBox, renderedWidth: number): Origin => ({
  x: at.x,
  y: at.y,
  factor: userScale(box.width, renderedWidth),
})

/**
 * How far a pointer now at `at` has travelled from `origin`, in the canvas's own user units.
 *
 * @param origin - Where the drag began and the factor it converts by.
 * @param at - The pointer's client coordinates now.
 * @returns The displacement {@link dragPoint} and {@link ghostAt} both add.
 */
export const travelledBy = (origin: Origin, at: Travelled): Travelled => ({
  x: (at.x - origin.x) * origin.factor,
  y: (at.y - origin.y) * origin.factor,
})

/**
 * A drag begun on whatever a pointer went down on, or `null` when it was not a bar.
 *
 * The layout is read once, here, rather than per pointer move: `dropTargetFor` needs the rails the
 * canvas was drawn from, and they cannot change while one pointer is down — a write is what redraws
 * them, and the drop is the write. Reading them per move would also be a DOM walk per move.
 *
 * `railTop` is resolved through the rail's **index** in that array and never off the rect's own `y`.
 * `railAtY` identifies a rail by its index, `railTop` is its inverse, and the index is the one thing
 * both directions have to agree about (`canvas/view.test.tsx` pins them against each other). Deriving
 * the band top from the drawn `y` instead would mean inverting `insideRail` here, which is a second
 * spelling of a number this app already owns in one place.
 *
 * The canvas's own box is read here too, off its three attributes rather than alongside them as props, so
 * the ghost drawn over it cannot be given a `viewBox` the canvas is not in.
 *
 * @param target - `event.target` from the `pointerdown`.
 * @param canvas - The canvas's `<svg>`, whose rails and whose box this reads.
 * @returns The drag to hold, or `null` when the pointer hit no bar or no rail carries it.
 */
export function heldFrom(target: EventTarget | null, canvas: Element): Held | null {
  const grabbed = grabbedAt(target)
  const rails = railsFrom(canvas)
  const index = grabbed === null ? -1 : rails.findIndex((rail) => rail.epicId === grabbed.epicId)
  if (grabbed === null || index === -1) return null
  return { grabbed, rails, railTop: railTop(index), box: boxOf(canvas), travelled: NOWHERE }
}

/** The two placements a drop is decided by: where it landed, and where it came from. */
export interface Settled {
  /** The placement the drop names, or `null` for a drop that names none and so cancels. */
  readonly to: DropTarget | null

  /** The placement the dragged feature already has, which is also what an undo sends. */
  readonly back: DropTarget | null
}

const aimedAt = (
  held: Held,
  by: Travelled,
  scale: PlanScale,
  axisX: number,
): DropTarget | null => {
  const point = dragPoint({ barX: held.grabbed.x, railTop: held.railTop }, by)
  if (inGutter(point.x, axisX)) return null
  return dropTargetFor({
    point,
    featureId: held.grabbed.featureId,
    rails: held.rails,
    scale,
    metrics: LAYOUT,
  })
}

/**
 * What a drop means: the placement it names, and the placement the feature is already at.
 *
 * **`back` is the same question asked of a drag that travelled nothing**, and that is the whole design
 * here rather than an economy. `dropTargetFor`'s answer for the bar's own x is "the placement that
 * changes nothing" — the function is explicit that a drop inside the gap a feature was already in
 * answers that feature's own stored slot, because "§9 … gates this phase on 'a test asserts nothing
 * auto-moves', and a drop inside the gap a feature was already in is a drop whose result the user could
 * not have seen". So one oracle answers both of the things a drop has to decide:
 *
 * - whether to send anything at all — {@link unchanged}, and never a comparison against
 *   `feature.position`, which is a different number on any rail carrying a feature the pass could not
 *   place (`packages/canvas/src/drag.ts` lists the five wrong numbers that have stood there);
 * - what an **undo** sends, which is that same `(epicId, position)` read before the drop rather than out
 *   of a shadow copy of the geometry. `actions/features.ts` says why that is possible at all: a
 *   placement answers the whole recomputed plan, so "the placement being undone is read out of the plan
 *   the surface was holding **before** the drop".
 *
 * Either may be `null`, and the two nulls mean different things. A `to` of `null` is a drop on the
 * chrome, in the gutter, below the last rail or on a rail no epic claims, and the caller cancels —
 * nothing clamps to the nearest rail, §6 having "no packing algorithm and nothing is ever auto-moved". A
 * `back` of `null` cannot happen for a bar the canvas drew, the band it was drawn in being a band, and it
 * is a value rather than a throw because the type cannot say so: it costs an undo, not a placement.
 *
 * @param held - The drag, including how far it has travelled.
 * @param scale - The scale the canvas was drawn at.
 * @param axisX - The x of the canvas's first day, which the gutter is left of.
 * @returns Both placements, neither of which this decides anything about.
 */
export const settledAt = (held: Held, scale: PlanScale, axisX: number): Settled => ({
  to: aimedAt(held, held.travelled, scale, axisX),
  back: aimedAt(held, NOWHERE, scale, axisX),
})

/**
 * Whether a drop asks for the placement the feature already has, in which case nothing is sent.
 *
 * The no-op half of the phase gate. Both members have to be present and equal: a refused drop is not
 * "unchanged", because a caller cancels it rather than leaving a request unsent.
 *
 * @param settled - Both placements, from {@link settledAt}.
 * @returns `true` when the drop would store exactly what is stored.
 */
export const unchanged = (settled: Settled): boolean =>
  settled.to !== null &&
  settled.back !== null &&
  settled.to.epicId === settled.back.epicId &&
  settled.to.position === settled.back.position

/**
 * Where the dragged bar's own rect has got to, for the ghost drawn over it.
 *
 * Its `x` is the same number {@link dragPoint} answers — the bar's left edge, which is what a drop is
 * compared against — so the ghost cannot be somewhere the placement was not computed from. Its `y` is
 * the rect's **own** y and not the band-relative centre that `railAtY` is asked about: one is where a
 * rectangle is drawn, the other is the reading `RailMetrics` makes symmetric, and drawing the ghost at
 * the centre would float it half a band below the pointer.
 *
 * @param held - The drag, including how far it has travelled.
 * @returns The ghost's top left in user units.
 */
export const ghostAt = (held: Held): Travelled => ({
  x: held.grabbed.x + held.travelled.x,
  y: held.grabbed.y + held.travelled.y,
})
