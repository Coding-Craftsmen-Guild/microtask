/** The authority levels a share link can carry, weakest first. */
export const ROLES = ['view', 'write', 'manage'] as const

/** The authority a share link carries. */
export type Role = (typeof ROLES)[number]

/** Narrows a value to a known role. */
export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)
