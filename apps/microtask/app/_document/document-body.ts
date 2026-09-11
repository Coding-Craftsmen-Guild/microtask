import { DocumentJson, type DocumentValue } from '@repo/contracts'
import { problemResponse } from './problem-response'

const NOT_JSON = 'The request body is not JSON.'

const NOT_A_DOCUMENT = 'The request body is not a document.'

/** A body that is a document, or the refusal to send in its place. */
export type DocumentBody =
  | { readonly ok: true; readonly document: DocumentValue }
  | { readonly ok: false; readonly refusal: Response }

const jsonOf = async (request: Request): Promise<{ readonly value: unknown } | null> => {
  try {
    return { value: await request.json() }
  } catch {
    return null
  }
}

/**
 * Reads a document write's body, refusing it here when it is not one.
 *
 * Two refusals, the same on both surfaces' document routes: 400 for a body that is not JSON, and
 * 422 — with the fields `DocumentJson` named — for JSON that is not a document. The API validates with the same schema, so a body refused here is one it would refuse
 * too, and refusing it on this side spends no round trip on it.
 */
export async function documentBody(request: Request, instance: string): Promise<DocumentBody> {
  const body = await jsonOf(request)
  if (body === null) {
    return { ok: false, refusal: problemResponse({ status: 400, code: 'bad_request', detail: NOT_JSON, instance }) }
  }
  const document = DocumentJson.safeParse(body.value)
  if (document.success) return { ok: true, document: document.data }
  const errors = document.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
  const refusal = problemResponse({ status: 422, code: 'invalid', detail: NOT_A_DOCUMENT, instance }, { in: 'json', errors })
  return { ok: false, refusal }
}
