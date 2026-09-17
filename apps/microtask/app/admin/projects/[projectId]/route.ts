import type { Project } from '@repo/api-client'
import { projectPagePath, taskPagePath } from '../../../../components/projects/paths'
import { apiForSession } from '../../../../lib/api'

const TAB = 'tab'

const NO_TAB = ''

const MOVED = 308

const CHOSEN = 307

const answer = (location: string, status: number): Response =>
  new Response(null, { status, headers: { location, 'cache-control': 'private, no-store' } })

const read = async (projectId: string): Promise<Project | null> => {
  const api = await apiForSession('admin')
  if (api === null) return null
  try {
    return await api.projects.read(projectId)
  } catch {
    return null
  }
}

const holds = (project: Project | null, taskId: string): boolean =>
  project !== null && project.tasks.some((task) => task.id === taskId)

/** The segment Next hands the legacy admin redirect. */
export interface LegacyProjectContext {
  /** Whatever followed `/admin/projects/`, unvalidated: the page it lands on decides what it names. */
  readonly params: Promise<{ projectId: string }>
}

/**
 * `GET /admin/projects/<projectId>`: the address every admin bookmark of the app being replaced
 * holds, answered rather than 404'd (parity route R3, ADR 0046, amending ADR 0022's `/share/`-only
 * continuity).
 *
 * **Without a `?tab=` it is a `308` to `/p/<projectId>`, and it reads nothing.** The mapping is
 * total and permanent because import preserves the project id (spec §7.6): the id in the old
 * address *is* the id of the project it becomes, so there is nothing to look up and no answer that
 * a later state could change.
 *
 * **With a `?tab=<tabId>` it is a `307`, to `/p/<projectId>/t/<tabId>` when the project holds that
 * task and to `/p/<projectId>` when it does not.** A legacy tab id is now a **task** id — import
 * takes the tab's own id verbatim for the task it becomes, minting a fresh id only for the single
 * inner `General` tab — so the tab id names a task page, not a tab. The legacy page rewrote its
 * own URL to carry `?tab=` on every switch, so this is the *common* shape of a real bookmark, not
 * the rare one.
 *
 * The status is the honest one for each: `308` says the mapping cannot change, and a target chosen
 * from a project read cannot say that, because deleting the task changes it. Both carry
 * `private, no-store` all the same — the status states whether the *mapping* is stable, the header
 * states who may keep a *copy*, and an admin-gated answer naming a project id belongs in no shared
 * cache. Nothing is bought by letting a browser skip a redirect that costs no API read.
 *
 * **A tab the project does not hold is the project page, not a 404.** Redirecting a stale `?tab=`
 * straight through would 404: `read-task.ts` goes through `adminRead`, so a task the API does not
 * hold is `notFound()`. That stays true of a *current* address — a live link to a task that does
 * not exist must still be a 404 — and only this legacy contract is lenient, because an address in
 * a client's browser history predates the data it names and must not become a dead end. The cost
 * is one `projects.read` per legacy hit with a `?tab=`, which is the same read the project page it
 * usually lands on is about to make.
 *
 * **Every failure of that read is the project page too**, and none of them is answered here: no
 * admin client, a 401 on a bearer the API no longer accepts, a project that does not exist, an
 * unreachable API. The redirect's job is to pick the better of two targets, and the page it hands
 * off to already has a considered answer for each — `/login?next=/p/<id>` through
 * `lib/problem.ts`, or its own not-found. Falling back also means a *changed* import id rule
 * degrades to the project page rather than to a dead end, which is why the drift the ids could
 * suffer is loud in `legacy.test` and harmless here.
 *
 * The query string is **dropped**, the `?tab=` included: it has been consumed into the path, and
 * carrying it onto the task page would name an inner tab that no import ever creates (the one it
 * creates is named `General` and carries a freshly minted id), so the task page would fall back to
 * its first tab and the address would claim something untrue. `proxy.ts` gates this route as it
 * gates every admin page, so a legacy bookmark opened from a signed-out browser reaches
 * `/login?next=/admin/projects/<id>?tab=<id>` and this handler runs after the form — which is what
 * the legacy app did, serving its login page at that same URL.
 */
export async function GET(request: Request, context: LegacyProjectContext): Promise<Response> {
  const { projectId } = await context.params
  const tab = new URL(request.url).searchParams.get(TAB) ?? NO_TAB
  if (tab === NO_TAB) return answer(projectPagePath(projectId), MOVED)
  const target = holds(await read(projectId), tab)
    ? taskPagePath(projectId, tab)
    : projectPagePath(projectId)
  return answer(target, CHOSEN)
}
