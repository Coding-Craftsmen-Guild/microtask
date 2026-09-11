import type { Context } from 'hono'
import { codeForStatus, problemResponse } from './problem.js'

const DETAIL = 'No route matches this request.'

/**
 * Answers an unmatched path as a 404 problem document.
 *
 * It reports that no route matched, never whether a resource exists, because the guarded subtree
 * refuses an unauthenticated caller before the router ever gets this far — a 404 that
 * distinguished "no such route" from "no such project" would hand back the difference the
 * credential check exists to withhold.
 */
export function notFoundHandler(c: Context): Response {
  return problemResponse({
    status: 404,
    code: codeForStatus(404),
    detail: DETAIL,
    instance: c.req.path,
  })
}
