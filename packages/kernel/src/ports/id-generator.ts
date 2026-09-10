/** Supplies new identifiers, so services never generate them themselves. */
export interface IdGenerator {
  /** Returns a new entity identifier. */
  entityId(): string

  /** Returns a new share-link token. */
  token(): string
}
