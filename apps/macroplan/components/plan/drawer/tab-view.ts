import type { PlanScreenModel } from '../plan-screen-model'
import { drawerSubject } from './subject'
import { closedHref, tabHref, sameTab, type TabRef } from './tab-stack'
import { nameOf } from './drawer-heading'
import type { SubjectKind } from './values'

/** One tab in the strip, with everything it draws and both of the addresses it holds. */
export interface TabView {
  /** Which kind of subject it holds, which decides the marker's shape. */
  readonly kind: SubjectKind

  /** The subject's id, which is also this tab's key. */
  readonly id: string

  /** Its name, as the row words it. */
  readonly name: string

  /** Its hue, or `''` where nothing colours it. */
  readonly colour: string

  /** Where clicking it goes: its own route, carrying the stack. */
  readonly href: string

  /** Where its cross goes: the stack with this one gone. */
  readonly closeHref: string

  /** Whether it is the one the panel is drawing. */
  readonly active: boolean
}

/**
 * The strip, resolved from the plan the page already read.
 *
 * A tab that names a subject the plan no longer holds is **dropped** rather than drawn as a dead tab:
 * the stack lives in the URL, so it outlives a delete made in another tab of the browser, and a strip
 * that drew a feature nobody can open would be a strip whose crosses are the only working part.
 *
 * Each tab carries its own two addresses because both depend on the whole stack: clicking one keeps the
 * others open, and closing one leaves the rest in the order they were in (`./tab-stack.ts`).
 *
 * @param plan - The plan the page read, which every name and hue comes out of.
 * @param stack - The tabs, in order.
 * @param active - The subject the route names.
 * @param root - The plan's own path, which both addresses hang off.
 * @returns One view per tab that still resolves, in order.
 */
export function tabViews(
  plan: PlanScreenModel,
  stack: readonly TabRef[],
  active: TabRef,
  root: string,
): readonly TabView[] {
  const found = stack.flatMap((tab) => {
    const subject = drawerSubject(plan, tab.kind, tab.id)
    return subject === undefined ? [] : [{ subject, tab }]
  })
  return found.map(({ subject, tab }) => ({
    active: sameTab(tab, active),
    closeHref: closedHref(root, tab, found.map((one) => one.tab), active),
    colour: subject.colour,
    href: tabHref(root, tab, found.map((one) => one.tab)),
    id: tab.id,
    kind: tab.kind,
    name: nameOf(subject.row),
  }))
}
