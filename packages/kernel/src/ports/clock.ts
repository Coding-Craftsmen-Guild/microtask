/** Supplies the current time, so services never read it themselves. */
export interface Clock {
  /** Returns the current time as an ISO 8601 string. */
  now(): string
}
