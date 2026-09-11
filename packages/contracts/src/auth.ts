import { z } from 'zod'

const MAX_PASSWORD = 1024

/**
 * What a caller sends to exchange the admin password for a token.
 *
 * The bound exists so an unbounded string cannot reach the hash, not to constrain what an
 * operator may choose: the app being replaced sets no maximum and only warns below eight
 * characters, and a length rule invented here would lock out a deployment that works today.
 */
export const LoginPayload = z
  .object({ password: z.string().min(1).max(MAX_PASSWORD) })
  .meta({ id: 'LoginPayload', description: 'The admin password, and nothing else' })

/**
 * The short-lived admin credential a successful login hands back (ADR 0012).
 *
 * It is a signed expiry rather than anything derived from the password, so a session has a
 * bounded life and rotating the signing key ends every one of them without a password change.
 * Both the instant and the remaining seconds are reported: the first is what a client stores,
 * the second is what it schedules a refresh against without trusting its own clock.
 */
export const AdminSession = z
  .object({
    token: z.string(),
    expiresAt: z.string(),
    expiresInSeconds: z.number().int().positive(),
  })
  .meta({ id: 'AdminSession', description: 'A short-lived admin bearer token and its expiry' })
