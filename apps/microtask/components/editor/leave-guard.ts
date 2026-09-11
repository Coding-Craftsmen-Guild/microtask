/** What the page asks before an in-app link would take it away from edits the editor holds. */
export const LEAVE_QUESTION = 'This tab has edits that are not saved. Leave anyway? They may be lost.'

const plainClick = (event: MouseEvent): boolean =>
  !event.defaultPrevented && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)

const linkOf = (event: MouseEvent): HTMLAnchorElement | null => {
  const found = event.target instanceof Element ? event.target.closest('a[href]') : null
  return found instanceof HTMLAnchorElement ? found : null
}

const destination = (link: HTMLAnchorElement, here: string): URL => new URL(link.getAttribute('href') ?? '', here)

const HERE_TARGETS: ReadonlySet<string> = new Set(['', '_self', '_parent', '_top'])

const opensHere = (link: HTMLAnchorElement): boolean =>
  !link.hasAttribute('download') && HERE_TARGETS.has(link.target.toLowerCase())

/**
 * Whether a click is one that takes this page to **another page of this app**: a plain
 * left-click, not already cancelled, on a link that opens in this browser tab, to this origin, at
 * a different path.
 *
 * Each exclusion is a click that leaves the editor mounted or is someone else's to guard:
 *
 * - a modified or middle click opens a new tab and keeps this page;
 * - `target="_blank"`, a target naming another window, and `download` do the same — while
 *   `_parent` and `_top` take this page away as `_self` does, since navigating a frame's parent
 *   unloads the frame, and every keyword is matched in any case, as the browser matches it;
 * - another origin is a hard navigation, which fires `beforeunload`, whose prompt already asks —
 *   asking here as well would ask twice;
 * - the same path, whatever its query or fragment, renders the same page, and the task page keys
 *   its editor on the task, so nothing is remounted;
 * - a click something else has already cancelled will not navigate at all.
 *
 * A plain `<a>` to this origin is counted, though the browser fires `beforeunload` for it too:
 * nothing on the page says whether Next or the browser will take a given link, so the island
 * asks for both, and lets its own `beforeunload` stay quiet after a leave the user chose.
 */
export function leavesPage(event: MouseEvent, here: string): boolean {
  const link = linkOf(event)
  if (link === null || !plainClick(event) || !opensHere(link)) return false
  const from = new URL(here)
  const to = destination(link, here)
  return to.origin === from.origin && to.pathname !== from.pathname
}
