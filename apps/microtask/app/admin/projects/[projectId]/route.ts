import type { Project } from '@repo/api-client'
import { projectPagePath, taskPagePath } from '../../../../components/projects/paths'
import { apiForSession } from '../../../../lib/api'

const TAB = 'tab'

const NO_TAB = ''

const CHOSEN = 307

const answer = (location: string): Response =>
  new Response(null, { status: CHOSEN, headers: { location, 'cache-control': 'private, no-store' } })

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

const deepLink = (projectId: string, tab: string): string => {
  const at = taskPagePath(projectId, projectId)
  return tab === NO_TAB ? at : `${at}?${TAB}=${encodeURIComponent(tab)}`
}

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
 * **It is a `307` to `/p/<projectId>/t/<projectId>`, after one `projects.read`.** A legacy file
 * imports as a project holding exactly one task under the project's *own* id, whose tab strip is
 * the legacy tabs (§7.6 as corrected 2026-09-21) — so the target is computable from the one
 * segment this handler already has, with no lookup table, and the page it lands on is the tab
 * strip the bookmark used to open. A `?tab=<tabId>` is carried **onto** that page, where it now
 * names an inner tab again rather than a task; every other query parameter is dropped.
 *
 * **A project that holds no task of its own id is `/p/<projectId>`, not a 404.** That is any
 * project not imported from legacy, and any legacy project imported as a *copy* — `remint.ts`
 * mints a fresh project id and a fresh task id for a copy (ADR 0019), which is why the copy path
 * deliberately breaks the old address. Redirecting straight through instead would 404:
 * `read-task.ts` goes through `adminRead`, so a task the API does not hold is `notFound()`. That
 * stays true of a *current* address — a live link to a task that does not exist must still be a
 * 404 — and only this legacy contract is lenient, because an address in a client's browser
 * history predates the data it names and must not become a dead end.
 *
 * **Every failure of that read is the project page too**, and none of them is answered here: no
 * admin client, a 401 on a bearer the API no longer accepts, a project that does not exist, an
 * unreachable API. The redirect's job is to pick the better of two targets, and the page it hands
 * off to already has a considered answer for each — `/login?next=/p/<id>` through
 * `lib/problem.ts`, or its own not-found. Falling back also means a *changed* import id rule
 * degrades to the project page rather than to a dead end, which is why the drift the ids could
 * suffer is loud in `legacy.test` and harmless here.
 *
 * **The tab half needs no guard of its own.** The task page validates `?tab=` against the tabs its
 * task actually holds and falls back to the first, which is exactly what the legacy page did
 * (parity feature 39). A tab deleted since the bookmark was taken therefore opens the task at its
 * first tab rather than 404ing, and this handler does not have to know which tabs exist.
 *
 * **One status, not two.** The earlier shape answered `308` to `/p/<projectId>` when no `?tab=`
 * was present, on the grounds that the mapping was total and needed no read. It was also the
 * wrong page: the legacy address served `project.html`, the document with its tab strip, and with
 * no `?tab=` it opened the *first tab* — never a list of tasks. The 308's permanence bought
 * nothing either, `private, no-store` forbidding the browser to keep the answer at all. What it
 * saved was one API read on the **rare** form, ADR 0046 having established that a real bookmark
 * almost always carries `?tab=`, and that read is the same one the page it lands on is about to
 * make. `307` is the honest status now that both answers are chosen from data that can change.
 *
 * `proxy.ts` gates this route as it gates every admin page, so a legacy bookmark opened from a
 * signed-out browser reaches `/login?next=/admin/projects/<id>?tab=<id>` and this handler runs
 * after the form — which is what the legacy app did, serving its login page at that same URL.
 */
export async function GET(request: Request, context: LegacyProjectContext): Promise<Response> {
  const { projectId } = await context.params
  const tab = new URL(request.url).searchParams.get(TAB) ?? NO_TAB
  const project = await read(projectId)
  return answer(holds(project, projectId) ? deepLink(projectId, tab) : projectPagePath(projectId))
}
