import { planRootOf } from '../drawer/tab-stack'

const RAIL_SEGMENT = 'r'

/**
 * Where a rail's own panel is, from the address the browser is on.
 *
 * A dropped rail arrives called `New epic`, so the drop opens the one place it can be renamed. The path
 * is worked out from `location` for the reason `canvas/open-click.ts` gives: the board's own chrome is a
 * client island, and the only address it may read a seat's token out of is the one the reader is already
 * at (`../drawer/tab-stack.ts`).
 *
 * @param pathname - Where the browser is.
 * @param epicId - The rail to open.
 * @returns The rail drawer's path.
 */
export const railPathOf = (pathname: string, epicId: string): string =>
  `${planRootOf(pathname)}/${RAIL_SEGMENT}/${encodeURIComponent(epicId)}`
