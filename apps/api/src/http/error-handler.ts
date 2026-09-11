import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { AppError } from '@repo/kernel'
import { codeForStatus, problemResponse, titleForStatus } from './problem.js'

const INTERNAL_DETAIL = 'The server could not complete the request.'

const fromAppError = (err: AppError, instance: string): Response =>
  problemResponse({ status: err.status, code: err.code, detail: err.message, instance })

const fromHttpException = (err: HTTPException, instance: string): Response =>
  problemResponse({
    status: err.status,
    code: codeForStatus(err.status),
    detail: err.message === '' ? titleForStatus(err.status) : err.message,
    instance,
  })

/**
 * Turns a thrown error into an RFC 7807 response, in three branches and no more.
 *
 * The order is `AppError` first, because a domain error carries its own `code` and message and
 * both are safe to show; then `HTTPException`, keyed on `.status` alone; then everything else as
 * a 500 whose detail is fixed. Nothing here reads a message string to decide anything: hono's
 * malformed-body failure arrives as an `HTTPException` with `.status === 400` and `.name === 'Error'`,
 * so matching on either the wording or the name would both duplicate the status branch and break
 * the moment hono rephrases it.
 *
 * The 500 branch never repeats the thrown message, because an unexpected error commonly quotes a
 * connection string, a path or a token. Only errors a handler raised deliberately describe
 * themselves to a caller.
 *
 * Only `Error` subclasses arrive here at all: hono's dispatcher guards with `err instanceof Error`
 * and rethrows anything else, which reaches the socket as a bare 500 with no body. That is why
 * nothing in this app throws a string or a plain object.
 */
export function errorHandler(err: Error, c: Context): Response {
  const instance = c.req.path
  if (err instanceof AppError) return fromAppError(err, instance)
  if (err instanceof HTTPException) return fromHttpException(err, instance)
  return problemResponse({ status: 500, code: codeForStatus(500), detail: INTERNAL_DETAIL, instance })
}
