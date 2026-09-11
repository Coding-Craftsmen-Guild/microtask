/**
 * The one method this package ever calls on a schema exported by `@repo/contracts`.
 *
 * Narrowing the schema to this rather than naming a Zod type is what keeps `zod` out of this
 * package's dependencies: the client is handed the schemas the API declares its responses with,
 * calls `parse` on them, and never constructs one. A client that re-declared a shape could drift
 * from the API by one optional field and nothing would notice (ADR 0024).
 */
export interface Decoder<Value> {
  /** Decodes a response body, throwing when it is not the shape the API promised. */
  parse(input: unknown): Value
}

/**
 * The value a contract schema yields, so no request or response type is written down twice.
 *
 * Spelled through `ReturnType` rather than `z.infer` for the same reason {@link Decoder} exists:
 * it needs no import from `zod` at all, so the type and the runtime dependency stay in step.
 */
export type Decoded<Schema extends Decoder<unknown>> = ReturnType<Schema['parse']>

/**
 * The `fetch` this package calls, narrowed to the two arguments it passes.
 *
 * Injectable so the tests never open a socket and so a Next.js caller can supply the instrumented
 * `fetch` its framework hands it. The default is `globalThis.fetch`, resolved per call rather
 * than captured at module load, so a test that replaces the global still works.
 */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/**
 * Where the API is and which app is calling.
 *
 * **Neither is read from the environment.** This package contains no `process.env` anywhere, and
 * `n/no-process-env` is an error in its lint config. A client that read its own service key from
 * the environment would be usable from a browser bundle only by inlining that key into the
 * bundle, which is exactly the leak ADR 0012 splits the two credentials to avoid: the service key
 * names the *server* making the call, so only server-side code may ever hold one.
 */
export interface ClientOptions {
  /** The origin the API is served from, with or without a trailing slash. */
  readonly baseUrl: string

  /** The `x-api-key` naming the calling app. It confers no authority on its own (ADR 0012). */
  readonly serviceKey: string

  /** A `fetch` to use instead of the global one. */
  readonly fetch?: Fetcher
}

/** Which task an operation addresses. */
export interface TaskRef {
  /** The project the task belongs to. */
  readonly projectId: string

  /** The task itself. */
  readonly taskId: string
}

/**
 * Which tab an operation addresses.
 *
 * Extends {@link TaskRef} the way `apps/api`'s route params do, so a tab is always named by the
 * whole path down to it rather than by three strings a caller could hand over in the wrong order.
 */
export interface TabRef extends TaskRef {
  /** The tab itself. */
  readonly tabId: string
}
