const LIT = 'data-lit'

const NEAR = 'data-near'

const HOVERING = 'data-hovering'

const HOVER_ID = 'data-hover-id'

const ARC_FROM = 'data-arc-from'

const ARC_TO = 'data-arc-to'

const GROUP = '[data-slot="feature-group"]'

const clear = (root: Element, name: string): void => {
  for (const one of root.querySelectorAll(`[${name}]`)) one.removeAttribute(name)
}

const neighbours = (root: Element, id: string): ReadonlySet<string> => {
  const near = new Set<string>()
  for (const one of root.querySelectorAll(`[${ARC_FROM}]`)) {
    const from = one.getAttribute(ARC_FROM) ?? ''
    const to = one.getAttribute(ARC_TO) ?? ''
    if (from !== id && to !== id) continue
    one.setAttribute(LIT, '')
    near.add(from === id ? to : from)
  }
  return near
}

/**
 * What a hover does to the board: lights one thread, keeps its neighbours, dims the rest.
 *
 * ### Three levels and not two
 *
 * The **thread** — the feature under the pointer, its items, and the arcs at either end of it — is lit:
 * full opacity and a thicker stroke. Its direct dependency **neighbours** are merely kept: full opacity,
 * ordinary stroke, because they are context rather than the subject. Everything else dims. A board of two
 * hundred features is otherwise a wall in which the thing being pointed at is no more legible than the
 * rest of it, and dimming is what the design asks for in place of a selection nobody made.
 *
 * ### Why it is attributes and not React state
 *
 * The canvas is server-rendered and two thousand marks deep, so a hover that re-rendered it would
 * re-render the plan on every pointer move. One attribute per lit node and one on the root is what the
 * browser then paints from (`./pointer-css.ts`), which is the same arrangement the drag ghost and the
 * board filter use.
 *
 * @param root - The pointer root, which every mark is somewhere inside.
 * @param id - The feature whose thread is hovered, or `''` for a pointer over nothing.
 */
export function lightThread(root: Element | null, id: string): void {
  if (root === null) return
  clear(root, LIT)
  clear(root, NEAR)
  if (id === '') {
    root.removeAttribute(HOVERING)
    return
  }
  root.setAttribute(HOVERING, '')
  const near = neighbours(root, id)
  for (const one of root.querySelectorAll(`[${HOVER_ID}]`)) {
    const held = one.getAttribute(HOVER_ID) ?? ''
    const light = held === id ? LIT : near.has(held) ? NEAR : null
    if (light === null) continue
    one.setAttribute(light, '')
    one.closest(GROUP)?.setAttribute(light, '')
  }
}

const BOARD = '[data-slot="plan-board"]'

/**
 * Where a hover's attributes go: the board, and not the whole screen around it.
 *
 * Every rule in `./pointer-css.ts` hangs off `[data-hovering]`, so setting it makes the browser re-style
 * everything beneath the element it is set on. On the screen's root
 * that was the head, the drawer and the table as well as the board — measured at the product's cap, a
 * hover cost 222 ms of style recalculation a frame, most of it on rows nobody was looking at. Everything a
 * hover lights is on the board, so the board is the root it needs; a screen with no board (a test of the
 * pointer alone) keeps the frame.
 *
 * @param frame - The pointer root.
 * @returns The board inside it, or the frame itself.
 */
export const hoverRootOf = (frame: Element | null): Element | null => frame?.querySelector(BOARD) ?? frame
