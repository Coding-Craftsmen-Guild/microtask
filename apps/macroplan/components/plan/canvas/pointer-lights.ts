const LIT = 'data-lit'

const HOVER_ID = 'data-hover-id'

const ARC_FROM = 'data-arc-from'

const ARC_TO = 'data-arc-to'

/**
 * Lights every part of one feature's thread, and puts out whatever was lit before.
 *
 * ### Why ids are compared and never interpolated
 *
 * The obvious implementation is `root.querySelectorAll(`[data-hover-id="${id}"]`)`, and it is the one
 * thing `labels/group-css.ts` guards against with `isStyleSafeId`: a value reaching a selector is a value
 * that can end the selector it is in. Reading the attribute back off each candidate removes the question
 * rather than answering it — there is no selector built from a plan's own data here at all, so no guard
 * is needed and none can be forgotten.
 *
 * The cost is a walk of every element carrying the attribute instead of an indexed match. That is a few
 * hundred nodes on a large plan, once per pointer entering a mark, which is nothing beside the paint it
 * causes.
 *
 * ### Why an arc is matched on either end
 *
 * A dependency belongs to two features, so a thread includes the arcs that leave it **and** the arcs that
 * arrive — the same test `sidebar/select-css.ts` makes for which arcs a feature selection leaves lit, and
 * the reason both say what a feature waits on and what waits on it without a second view.
 *
 * ### Why the attribute is set rather than rendered
 *
 * The marks are the server's and React did not render them. Setting an attribute on them is what
 * `sidebar/sidebar-search.tsx` does with `hidden`, and for its reason: a re-render that replaced them
 * would undo the thing just done to them. Passing `''` as the id is how the caller puts everything out.
 *
 * @param root - The element the pointer listens over, or `null` before it is mounted.
 * @param id - The feature whose thread to light, or `''` to light nothing.
 */
export function lightThread(root: Element | null, id: string): void {
  if (root === null) return
  for (const one of root.querySelectorAll(`[${LIT}]`)) one.removeAttribute(LIT)
  if (id === '') return
  for (const one of root.querySelectorAll(`[${HOVER_ID}]`)) {
    if (one.getAttribute(HOVER_ID) === id) one.setAttribute(LIT, '')
  }
  for (const one of root.querySelectorAll(`[${ARC_FROM}]`)) {
    const ends = [one.getAttribute(ARC_FROM), one.getAttribute(ARC_TO)]
    if (ends.includes(id)) one.setAttribute(LIT, '')
  }
}
