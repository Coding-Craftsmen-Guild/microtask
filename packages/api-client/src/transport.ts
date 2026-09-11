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
}

/** The two ways a response comes back: decoded through a contract schema, or with no body. */
export interface Transport {
  /** Sends a call and decodes its body with the schema the API declares that response with. */
  json<Value>(call: Call, schema: Decoder<Value>): Promise<Value>

  /** Sends a call whose success carries no body, such as a delete answering 204. */
  empty(call: Call): Promise<void>
}

const JSON_MEDIA_TYPE = 'application/json'

const urlFor = (baseUrl: string, call: Call): string => {
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
  return call.body === undefined
    ? { method: call.method, headers }
    : { method: call.method, headers, body: JSON.stringify(call.body) }
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
 * A non-2xx becomes a thrown {@link ApiError} rather than a returned union, so a caller that
 * forgets to check gets a rejection instead of a value it will read as data. Success bodies are
 * parsed by the contract schema the API declares the response with, so a server that starts
 * sending a different shape fails here instead of one screen later.
 */
export function createTransport(options: ClientOptions, token: string | null): Transport {
  const fetcher: Fetcher = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const send = async (call: Call): Promise<Response> => {
    const response = await fetcher(urlFor(options.baseUrl, call), initFor(options, token, call))
    if (!response.ok) throw await errorFrom(response, call.path)
    return response
  }
  return {
    async json(call, schema) {
      const response = await send(call)
      const body: unknown = await response.json()
      return schema.parse(body)
    },
    async empty(call) {
      await send(call)
    },
  }
}
