import { AdminSession } from '@repo/contracts'
import { LOGIN_PATH } from './paths.js'
import { createTransport } from './transport.js'
import type { ClientOptions, Decoded } from './types.js'

/** The short-lived admin credential a successful login hands back (ADR 0012). */
export type AdminSessionValue = Decoded<typeof AdminSession>

/**
 * Exchanges the admin password for the token {@link createAdminClient} is built with.
 *
 * A free function rather than a method on a client, because it is the one route in this API that
 * mints a principal instead of requiring one: there is no client to call it on until it has
 * answered. It is the only caller that passes a null bearer to the transport — the service key
 * still goes, so the one unauthenticated write in this API still names the app making it.
 *
 * A wrong password and an unrecognised service key are the same 401 with the same document. That
 * is the API's decision and not something this function can improve on: telling the two apart
 * would confirm a valid service key to anyone holding a stolen one.
 *
 * The password is sent in the body and never in a query string or a header, so it cannot reach a
 * server log or a proxy log through the request line.
 */
export function login(options: ClientOptions, password: string): Promise<AdminSessionValue> {
  const transport = createTransport(options, null)
  return transport.json({ method: 'POST', path: LOGIN_PATH, body: { password } }, AdminSession)
}
