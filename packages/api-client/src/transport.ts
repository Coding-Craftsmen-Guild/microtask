import { errorFrom } from './api-error.js'
import type { ClientOptions, Decoder, Fetcher } from './types.js'

/** One request: everything that differs between the operations this package exposes. */
export interface Call {
  /**
   * The HTTP method, upper-cased.
   *
   * Upper-case is not cosmetic: `PATCH` is not in the Fetch specification's method-normalisation
   * list, so a lower-cased `patch` silently matches no route at all.
   */
  readonly method: string

  /** The path below the base URL, with every id already percent-encoded. */
  readonly path: string

  /** Query parameters, appended as a search string. */
  readonly query?: Readonly<Record<string, string>>

  /** The request body, serialised as JSON when present. */
  readonly body?: unknown

  /** Further headers, such as the `If-Match` a conditional write carries. */
  readonly headers?: Readonly<Record<string, string>>

  /**
   * A signal that cancels the request, for a debounced search or a superseded read.
   *
   * An already-aborted signal rejects **before** `fetch` is called, so a cancelled call issues
   * no request at all rather than one whose answer is thrown away. Optional, so nothing existing
   * changes shape; the cost is that a transport that failed to forward it would cancel nothing
   * and say so to nobody (ADR 0036).
   */
  readonly signal?: AbortSignal
}

/**
 * What a byte body may be, taken from `fetch`'s own `body` rather than named.
 *
 * `BodyInit` is not a global under `lib: ES2023` — this package compiles without the DOM library,
 * which is what keeps it usable from a Node server as well as a browser bundle — and spelling the
 * union out here would be a copy of the platform's that could drift. `NonNullable` drops the
 * `null` a `RequestInit` may legitimately carry for "no body": a byte call always has one.
 */
export type RawBody = NonNullable<RequestInit['body']>

/**
 * One request whose body is **bytes**, for the one operation in this API that carries any.
 *
 * A separate shape rather than a widened {@link Call}, because the two bodies are handled
 * incompatibly: a `Call`'s `body` is JSON-stringified, and a `Uint8Array` stringifies to
 * `{"0":1,"1":2,…}` — a document the import route would append to a staging file in place of the
 * bytes it was sent, corrupting the file without failing the request. Naming the byte body
 * `bytes` makes the two impossible to confuse at the call site and at the type level.
 */
export interface RawCall extends Omit<Call, 'body'> {
  /** The chunk itself, sent verbatim and declared `application/octet-stream`. */
  readonly bytes: RawBody
}

/**
 * The four ways a call is sent and its answer taken.
 *
 * `json` and `empty` are the whole of the ordinary API: a JSON body in, a contract-parsed body or
 * nothing back. The other two exist because two operations move **bytes**, and ADR 0015 makes
 * each of them a Next route handler rather than a Server Action — neither of which the first two
 * could serve:
 *
 * - `json` **JSON-stringifies every body**, so an import chunk sent through it arrives as a JSON
 *   object of indices rather than as the bytes the staging file must hold (ADR 0044).
 *   {@link bytes} sends the body verbatim.
 * - `json` also awaits and **parses every response through a contract schema**, which buffers a
 *   whole workspace bundle in this process to hand the browser a string it will only stream out
 *   again. {@link stream} answers the `Response` with its body unread, so the export proxy passes
 *   the upstream body straight through (ADR 0041).
 *
 * All four go through the same credential wiring, which is why they are methods here rather than
 * a `fetch` written out again inside each route handler: `x-api-key` and the bearer are required
 * *together* on every request, and a handler assembling its own could present one without the
 * other and read the 401 as an outage (ADR 0012).
 */
export interface Transport {
  /** Sends a call and decodes its body with the schema the API declares that response with. */
  json<Value>(call: Call, schema: Decoder<Value>): Promise<Value>

  /** Sends a call whose success carries no body, such as a delete answering 204. */
  empty(call: Call): Promise<void>

  /** Sends a byte body verbatim and decodes the answer through the response's own schema. */
  bytes<Value>(call: RawCall, schema: Decoder<Value>): Promise<Value>

  /** Sends a call and answers the `Response` itself, body unread, for a caller that streams it. */
  stream(call: Call): Promise<Response>
}

const JSON_MEDIA_TYPE = 'application/json'

const OCTET_STREAM = 'application/octet-stream'

type Addressed = Pick<Call, 'path' | 'query' | 'signal'>

const urlFor = (baseUrl: string, call: Addressed): string => {
  const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const search = new URLSearchParams(call.query ?? {}).toString()
  return search === '' ? `${root}${call.path}` : `${root}${call.path}?${search}`
}

const headersFor = (
  options: ClientOptions,
  token: string | null,
  call: Call,
): Record<string, string> => {
  const headers: Record<string, string> = {
    accept: JSON_MEDIA_TYPE,
    'x-api-key': options.serviceKey,
  }
  if (token !== null) headers['authorization'] = `Bearer ${token}`
  if (call.body !== undefined) headers['content-type'] = JSON_MEDIA_TYPE
  return { ...headers, ...call.headers }
}

const initFor = (options: ClientOptions, token: string | null, call: Call): RequestInit => {
  const headers = headersFor(options, token, call)
  const cancellable = call.signal === undefined ? {} : { signal: call.signal }
  return call.body === undefined
    ? { method: call.method, headers, ...cancellable }
    : { method: call.method, headers, body: JSON.stringify(call.body), ...cancellable }
}

const rawInit = (options: ClientOptions, token: string | null, call: RawCall): RequestInit => {
  const headers = { ...headersFor(options, token, call), 'content-type': OCTET_STREAM, ...call.headers }
  const cancellable = call.signal === undefined ? {} : { signal: call.signal }
  return { method: call.method, headers, body: call.bytes, ...cancellable }
}

/**
 * Builds the transport both client kinds are made of.
 *
 * Both credentials go on **every** request, which is what makes either client usable at all:
 * `x-api-key` says which app is calling and the bearer is the only thing that names a principal,
 * and `requirePrincipal` refuses a request carrying one without the other (ADR 0012). They are
 * two arguments here rather than one because they have different lifetimes and different
 * holders — the service key belongs to the deployment and the token to whoever is asking.
 *
 * `token` is nullable for exactly one caller: `login`, which is the route that mints a token and
 * so cannot present one. Nothing else passes `null`.
 *
 * A call carrying an already-aborted `signal` rejects before the fetcher is reached, so a
 * superseded request issues nothing at all. The check is here rather than left to `fetch`
 * because it is the injectable seam: a caller's instrumented fetch, or a test double, would
 * otherwise decide whether cancellation means anything.
 *
 * A non-2xx becomes a thrown {@link ApiError} rather than a returned union, so a caller that
 * forgets to check gets a rejection instead of a value it will read as data. Success bodies are
 * parsed by the contract schema the API declares the response with, so a server that starts
 * sending a different shape fails here instead of one screen later.
 */
export function createTransport(options: ClientOptions, token: string | null): Transport {
  const fetcher: Fetcher = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const dispatch = async (call: Addressed, init: RequestInit): Promise<Response> => {
    call.signal?.throwIfAborted()
    const response = await fetcher(urlFor(options.baseUrl, call), init)
    if (!response.ok) throw await errorFrom(response, call.path)
    return response
  }
  const send = (call: Call): Promise<Response> => dispatch(call, initFor(options, token, call))
  return {
    async json(call, schema) {
      const response = await send(call)
      const body: unknown = await response.json()
      return schema.parse(body)
    },
    async empty(call) {
      await send(call)
    },
    async bytes(call, schema) {
      const response = await dispatch(call, rawInit(options, token, call))
      const body: unknown = await response.json()
      return schema.parse(body)
    },
    stream: send,
  }
}
